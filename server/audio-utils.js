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

export async function convertTempo(inputPath, outputPath, tempoFactor) {
  const filter = buildAtempoChain(tempoFactor);

  await runFfmpeg([
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-filter:a",
    filter,
    "-codec:a",
    "libmp3lame",
    "-q:a",
    "2",
    outputPath
  ]);
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
