import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { v4 as uuidv4 } from "uuid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const STORAGE_DIR = path.join(__dirname, "storage");
export const INPUT_DIR = path.join(STORAGE_DIR, "input");
export const OUTPUT_DIR = path.join(STORAGE_DIR, "output");
export const MIN_BPM = 40;
export const MAX_BPM = 260;
export const MAX_FILE_BYTES = 80 * 1024 * 1024;
const METRONOME_CLICK_SECONDS = 0.03;
const METRONOME_CLICK_FREQUENCY = 1200;
const METRONOME_CLICK_AMPLITUDE = 0.55;
const METRONOME_MIX_WEIGHTS = {
  low: 0.16,
  medium: 0.28,
  high: 0.48
};
const METRONOME_SOUND_TYPES = new Set(["pulse", "drum"]);
const EXPLICIT_BPM_FILE_NAME_PATTERN = /(?:^|[-_\s])(\d{2,3}(?:\.\d{1,2})?)\s*bpm(?:\.[^.]+)?$/i;
const METADATA_BPM_KEYS = new Set(["bpm", "tbpm"]);

export function isValidBpm(value) {
  const bpm = Number(value);
  return Number.isFinite(bpm) && bpm >= MIN_BPM && bpm <= MAX_BPM;
}

export function normalizeBpm(value) {
  if (!isValidBpm(value)) {
    throw new Error(`BPM must be between ${MIN_BPM} and ${MAX_BPM}.`);
  }

  return Math.round(Number(value) * 10) / 10;
}

export function calculateTempoFactor(sourceBpm, targetBpm) {
  const source = normalizeBpm(sourceBpm);
  const target = normalizeBpm(targetBpm);
  return Math.round((target / source) * 10000) / 10000;
}

export function createMusicTempoOptions() {
  return {
    maxBeatInterval: Math.round((60 / MIN_BPM) * 10000) / 10000,
    minBeatInterval: Math.round((60 / MAX_BPM) * 10000) / 10000
  };
}

export function adjustBpmForMode(bpm, mode = "normal") {
  const source = normalizeBpm(bpm);

  if (mode === "half") {
    return normalizeBpm(source / 2);
  }

  if (mode === "double") {
    return normalizeBpm(source * 2);
  }

  return source;
}

export function buildAtempoChain(factor) {
  const tempo = Number(factor);
  if (!Number.isFinite(tempo) || tempo <= 0) {
    throw new Error("Tempo factor must be a positive number.");
  }

  const filters = [];
  let remaining = tempo;

  while (remaining > 2) {
    filters.push(2);
    remaining /= 2;
  }

  while (remaining < 0.5) {
    filters.push(0.5);
    remaining /= 0.5;
  }

  filters.push(Math.round(remaining * 10000) / 10000);
  return filters.map((value) => `atempo=${value}`).join(",");
}

function roundSeconds(value, precision = 3) {
  return Math.round(Number(value) * 10 ** precision) / 10 ** precision;
}

function formatSeconds(value) {
  return String(roundSeconds(value)).replace(/\.?0+$/, "");
}

export function buildMetronomeGrid(targetBpm, durationSeconds) {
  const target = normalizeBpm(targetBpm);
  const duration = Math.max(0, Number(durationSeconds) || 0);
  const interval = 60 / target;
  const beats = [];

  for (let beatTime = 0; beatTime <= duration + 1e-9; beatTime += interval) {
    beats.push(roundSeconds(beatTime));
  }

  return beats;
}

export function extractBpmFromFileName(fileName = "") {
  const baseName = path.basename(String(fileName));
  const match = baseName.match(EXPLICIT_BPM_FILE_NAME_PATTERN);
  if (!match) return null;

  try {
    return normalizeBpm(match[1]);
  } catch {
    return null;
  }
}

export function extractBpmFromMetadata(metadata = {}) {
  for (const [key, value] of Object.entries(metadata || {})) {
    if (!METADATA_BPM_KEYS.has(String(key).toLowerCase())) continue;

    try {
      return normalizeBpm(value);
    } catch {
      return null;
    }
  }

  return null;
}

export function chooseDetectedTempo({
  originalName = "",
  metadata = {},
  musicTempoBpm,
  musicTempoBeats = [],
  durationSeconds = 0
}) {
  const metadataBpm = extractBpmFromMetadata(metadata);
  const fileNameBpm = extractBpmFromFileName(originalName);
  const explicitBpm = metadataBpm || fileNameBpm;

  if (explicitBpm) {
    return {
      detectedBpm: explicitBpm,
      detectedBeats: buildMetronomeGrid(explicitBpm, durationSeconds),
      detectionSource: metadataBpm ? "metadata" : "filename"
    };
  }

  return {
    detectedBpm: normalizeBpm(musicTempoBpm),
    detectedBeats: Array.isArray(musicTempoBeats) ? musicTempoBeats : [],
    detectionSource: "analysis"
  };
}

export function normalizeMetronomeSound(value = "pulse") {
  const sound = String(value || "").toLowerCase();
  return METRONOME_SOUND_TYPES.has(sound) ? sound : "pulse";
}

export function buildMetronomeClickSource(targetBpm, durationSeconds, soundType = "pulse") {
  const target = normalizeBpm(targetBpm);
  const sound = normalizeMetronomeSound(soundType);
  const intervalSeconds = formatSeconds(60 / target);
  const beatPhase = `mod(t\\,${intervalSeconds})`;
  let expression;

  if (sound === "drum") {
    const barBeat = `mod(floor(t/${intervalSeconds})\\,4)`;
    const kickAccent = `if(eq(${barBeat}\\,0)+eq(${barBeat}\\,2)\\,1\\,0.42)`;
    const snareAccent = `if(eq(${barBeat}\\,1)+eq(${barBeat}\\,3)\\,1\\,0.16)`;
    const kick =
      `if(lt(${beatPhase}\\,0.16)\\,` +
      `${kickAccent}*0.9*exp(-${beatPhase}*38)*` +
      `sin(2*PI*(52+105*exp(-${beatPhase}*18))*${beatPhase})\\,0)`;
    const snare =
      `if(lt(${beatPhase}\\,0.11)\\,` +
      `${snareAccent}*0.24*exp(-${beatPhase}*55)*` +
      `(sin(2*PI*180*t)+0.45*sin(2*PI*330*t)+0.35*sin(2*PI*2400*t))\\,0)`;
    const hiHat =
      `if(lt(${beatPhase}\\,0.045)\\,` +
      `0.16*exp(-${beatPhase}*95)*(sin(2*PI*6500*t)+0.6*sin(2*PI*9300*t))\\,0)`;

    expression = `${kick}+${snare}+${hiHat}`;
  } else {
    expression =
      `if(lt(${beatPhase}\\,${formatSeconds(METRONOME_CLICK_SECONDS)})\\,` +
      `${METRONOME_CLICK_AMPLITUDE}*sin(2*PI*${METRONOME_CLICK_FREQUENCY}*t)\\,0)`;
  }

  const parts = [`aevalsrc=exprs=${expression}`, "s=44100"];
  const duration = Number(durationSeconds);

  if (Number.isFinite(duration) && duration > 0) {
    parts.push(`d=${formatSeconds(duration)}`);
  }

  return parts.join(":");
}

export function normalizeMetronomeVolume(value = "medium") {
  const volume = String(value || "").toLowerCase();
  return Object.hasOwn(METRONOME_MIX_WEIGHTS, volume) ? volume : "medium";
}

export function getMetronomeMixWeight(value = "medium") {
  return METRONOME_MIX_WEIGHTS[normalizeMetronomeVolume(value)];
}

function findNearestMetronomeBeat(beatSeconds, metronomeGridSeconds) {
  if (!metronomeGridSeconds.length) return 0;

  return metronomeGridSeconds.reduce((nearest, candidate) => {
    const currentDistance = Math.abs(candidate - beatSeconds);
    const nearestDistance = Math.abs(nearest - beatSeconds);
    return currentDistance < nearestDistance ? candidate : nearest;
  }, metronomeGridSeconds[0]);
}

export function buildTempoAlignmentPlan({
  sourceBpm,
  targetBpm,
  sourceBeats = [],
  durationSeconds = 0
}) {
  const source = normalizeBpm(sourceBpm);
  const target = normalizeBpm(targetBpm);
  const tempoFactor = calculateTempoFactor(source, target);
  const sourceFirstBeatSeconds = roundSeconds(
    sourceBeats.find((beat) => Number.isFinite(Number(beat)) && Number(beat) >= 0) || 0
  );
  const stretchedDurationSeconds = roundSeconds((Number(durationSeconds) || 0) / tempoFactor);
  const stretchedFirstBeatSeconds = roundSeconds(sourceFirstBeatSeconds / tempoFactor);
  const metronomeGridSeconds = buildMetronomeGrid(targetBpm, stretchedDurationSeconds);
  const metronomeFirstBeatSeconds = findNearestMetronomeBeat(stretchedFirstBeatSeconds, metronomeGridSeconds);
  const phaseShiftSeconds = roundSeconds(stretchedFirstBeatSeconds - metronomeFirstBeatSeconds);

  return {
    sourceBpm: source,
    targetBpm: target,
    tempoFactor,
    sourceFirstBeatSeconds,
    stretchedFirstBeatSeconds,
    stretchedDurationSeconds,
    metronomeFirstBeatSeconds,
    metronomeGridSeconds,
    trimAfterTempoSeconds: Math.max(0, phaseShiftSeconds),
    delayBeforeAudioSeconds: Math.max(0, -phaseShiftSeconds)
  };
}

export function buildTempoAlignmentFilter(options) {
  const plan = buildTempoAlignmentPlan(options);
  const filters = [buildAtempoChain(plan.tempoFactor)];

  if (plan.trimAfterTempoSeconds > 0) {
    filters.push(`atrim=start=${formatSeconds(plan.trimAfterTempoSeconds)}`, "asetpts=PTS-STARTPTS");
  } else if (plan.delayBeforeAudioSeconds > 0) {
    filters.push(`adelay=${Math.round(plan.delayBeforeAudioSeconds * 1000)}:all=1`);
  }

  return filters.join(",");
}

function getConvertedDurationSeconds(plan) {
  const duration =
    plan.stretchedDurationSeconds - plan.trimAfterTempoSeconds + plan.delayBeforeAudioSeconds;

  if (!Number.isFinite(duration) || duration <= 0) {
    return null;
  }

  return roundSeconds(duration + 0.25);
}

export function buildTempoConversionArgs(inputPath, outputPath, tempoFactorOrOptions) {
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath];
  const isSimpleTempo = typeof tempoFactorOrOptions === "number";
  const plan = isSimpleTempo ? null : buildTempoAlignmentPlan(tempoFactorOrOptions);
  const filter = isSimpleTempo
    ? buildAtempoChain(tempoFactorOrOptions)
    : buildTempoAlignmentFilter(tempoFactorOrOptions);

  if (!isSimpleTempo && tempoFactorOrOptions.mixMetronome) {
    args.push(
      "-f",
      "lavfi",
      "-i",
      buildMetronomeClickSource(
        plan.targetBpm,
        getConvertedDurationSeconds(plan),
        tempoFactorOrOptions.metronomeSound
      )
    );
  }

  args.push("-vn");

  if (!isSimpleTempo && tempoFactorOrOptions.mixMetronome) {
    const metronomeMixWeight = getMetronomeMixWeight(tempoFactorOrOptions.metronomeVolume);

    args.push(
      "-filter_complex",
      `[0:a]${filter}[music];` +
        `[music][1:a]amix=inputs=2:duration=first:weights=1 ${metronomeMixWeight}:normalize=0,` +
        "alimiter=limit=0.98[out]",
      "-map",
      "[out]"
    );
  } else {
    args.push("-filter:a", filter);
  }

  args.push("-codec:a", "libmp3lame", "-q:a", "2");

  if (!isSimpleTempo) {
    args.push("-metadata", `TBPM=${plan.targetBpm}`, "-metadata", `BPM=${plan.targetBpm}`);
  }

  args.push(outputPath);

  return args;
}

export function getSafeExtension(fileName = "", fallback = ".bin") {
  const extension = path.extname(fileName).toLowerCase().replace(/[^.a-z0-9]/g, "");
  return extension || fallback;
}

export function createStoredFilePath(originalName) {
  return path.join(INPUT_DIR, `${uuidv4()}${getSafeExtension(originalName)}`);
}

export function createOutputFilePath(fileId) {
  return path.join(OUTPUT_DIR, `${fileId}-converted.mp3`);
}

export async function ensureStorage() {
  await fs.mkdir(INPUT_DIR, { recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

export async function clearStorage() {
  await fs.rm(INPUT_DIR, { recursive: true, force: true });
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  await ensureStorage();
}

export function runFfmpeg(args, options = {}) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, args, {
      windowsHide: true,
      ...options
    });

    const stderr = [];

    ffmpeg.stderr.on("data", (chunk) => {
      stderr.push(chunk.toString());
    });

    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.join("").trim() || `FFmpeg exited with code ${code}.`));
    });
  });
}

export function readFfmpegStdout(args) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, args, { windowsHide: true });
    const stdout = [];
    const stderr = [];

    ffmpeg.stdout.on("data", (chunk) => {
      stdout.push(chunk);
    });

    ffmpeg.stderr.on("data", (chunk) => {
      stderr.push(chunk.toString());
    });

    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout));
        return;
      }

      reject(new Error(stderr.join("").trim() || `FFmpeg exited with code ${code}.`));
    });
  });
}

export function parseFfmpegMetadata(text = "") {
  return String(text)
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith(";"))
    .reduce((metadata, line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) return metadata;

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (key) {
        metadata[key] = value;
      }
      return metadata;
    }, {});
}

export async function readAudioMetadata(filePath) {
  try {
    const output = await readFfmpegStdout([
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      filePath,
      "-f",
      "ffmetadata",
      "pipe:1"
    ]);

    return parseFfmpegMetadata(output.toString());
  } catch {
    return {};
  }
}

export async function decodeToMonoPcm(filePath, options = {}) {
  const { startAt = 0, analyzeSeconds = 90 } = options;
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
  ];

  if (startAt > 0) {
    args.push("-ss", String(startAt));
  }

  args.push(
    "-i",
    filePath,
    "-vn",
    "-t",
    String(analyzeSeconds),
    "-ac",
    "1",
    "-ar",
    "44100",
    "-f",
    "f32le",
    "pipe:1",
  );

  const buffer = await readFfmpegStdout(args);

  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / Float32Array.BYTES_PER_ELEMENT);
}

export function chooseAnalysisWindow(durationSeconds) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 100) {
    return { startAt: 0, analyzeSeconds: 90 };
  }

  const analyzeSeconds = Math.min(90, Math.max(30, durationSeconds - 10));
  const startAt = Math.max(0, Math.round((durationSeconds - analyzeSeconds) / 2));
  return { startAt, analyzeSeconds };
}

export async function probeDuration(filePath) {
  const output = await new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      ffmpegPath,
      ["-hide_banner", "-i", filePath, "-f", "null", "-"],
      { windowsHide: true }
    );

    const stderr = [];
    ffmpeg.stderr.on("data", (chunk) => stderr.push(chunk.toString()));
    ffmpeg.on("error", reject);
    ffmpeg.on("close", () => resolve(stderr.join("")));
  });

  const match = output.match(/Duration:\s(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
  if (!match) {
    return null;
  }

  const [, hours, minutes, seconds] = match;
  return Math.round((Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 10) / 10;
}

export async function convertTempo(inputPath, outputPath, tempoFactorOrOptions) {
  await runFfmpeg(buildTempoConversionArgs(inputPath, outputPath, tempoFactorOrOptions));
}

export async function removeFileIfExists(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

export async function removeStoredPair(record) {
  if (!record) return;

  await Promise.all([
    record.inputPath ? removeFileIfExists(record.inputPath) : Promise.resolve(),
    record.outputPath ? removeFileIfExists(record.outputPath) : Promise.resolve()
  ]);
}
