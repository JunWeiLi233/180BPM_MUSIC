import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "node:fs/promises";
import path from "node:path";
import MusicTempo from "music-tempo";
import {
  adjustBpmForMode,
  buildTempoAlignmentPlan,
  calculateTempoFactor,
  chooseAnalysisWindow,
  chooseDetectedTempo,
  clearStorage,
  convertTempo,
  createOutputFilePath,
  createMusicTempoOptions,
  createStoredFilePath,
  decodeToMonoPcm,
  ensureStorage,
  INPUT_DIR,
  isValidBpm,
  MAX_FILE_BYTES,
  normalizeBpm,
  normalizeMetronomeSound,
  normalizeMetronomeVolume,
  OUTPUT_DIR,
  probeDuration,
  readAudioMetadata,
  removeFileIfExists,
  removeStoredPair
} from "./audio-utils.js";
import { DEFAULT_LANGUAGE, getLanguageFromPathname } from "../src/i18n.js";
import { decorateHtmlForSeo } from "./seo-html.js";

await ensureStorage();

const files = new Map();
const RETENTION_MS = 60 * 60 * 1000;

setInterval(async () => {
  const now = Date.now();

  for (const [fileId, record] of files.entries()) {
    if (now - record.createdAt > RETENTION_MS) {
      files.delete(fileId);
      await removeStoredPair(record);
    }
  }
}, 10 * 60 * 1000).unref();

const storage = multer.diskStorage({
  destination: async (_req, _file, callback) => {
    try {
      await fs.mkdir(INPUT_DIR, { recursive: true });
      callback(null, INPUT_DIR);
    } catch (error) {
      callback(error);
    }
  },
  filename: (_req, file, callback) => {
    const storedPath = createStoredFilePath(file.originalname);
    callback(null, path.basename(storedPath));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req, file, callback) => {
    const allowedByMime = file.mimetype.startsWith("audio/");
    const allowedByExtension = /\.(mp3|wav|m4a|aac|ogg|flac|aiff|aif)$/i.test(file.originalname);

    if (allowedByMime || allowedByExtension) {
      callback(null, true);
      return;
    }

    callback(new Error("Upload a supported audio file."));
  }
});

export const app = express();
const distPath = path.join(process.cwd(), "dist");

app.use(cors());
app.use(express.json());
app.use("/downloads", express.static(OUTPUT_DIR));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "Beats Your Music" });
});

app.post("/api/analyze", upload.single("track"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Choose an audio file to analyze." });
      return;
    }

    const fileId = path.parse(req.file.filename).name;
    const filePath = req.file.path;
    const duration = await probeDuration(filePath);
    const metadata = await readAudioMetadata(filePath);
    const analysisWindow = chooseAnalysisWindow(duration);
    const samples = await decodeToMonoPcm(filePath, analysisWindow);
    const mt = new MusicTempo(Array.from(samples), createMusicTempoOptions());
    const tempoResult = chooseDetectedTempo({
      originalName: req.file.originalname,
      metadata,
      musicTempoBpm: mt.tempo,
      musicTempoBeats: mt.beats,
      durationSeconds: duration
    });

    const record = {
      fileId,
      inputPath: filePath,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      detectedBpm: tempoResult.detectedBpm,
      detectedBeats: tempoResult.detectedBeats,
      detectionSource: tempoResult.detectionSource,
      duration,
      createdAt: Date.now()
    };
    files.set(fileId, record);

    res.json({
      fileId,
      originalName: record.originalName,
      mimeType: record.mimeType,
      size: record.size,
      detectedBpm: record.detectedBpm,
      detectionSource: record.detectionSource,
      duration,
      targetBpm: 180
    });
  } catch (error) {
    if (req.file?.path) {
      await removeFileIfExists(req.file.path);
    }
    next(error);
  }
});

app.post("/api/convert", async (req, res, next) => {
  try {
    const {
      fileId,
      sourceBpm,
      targetBpm,
      sourceMode = "normal",
      mixMetronome = false,
      metronomeVolume = "medium",
      metronomeSound = "pulse"
    } = req.body;
    const record = files.get(fileId);

    if (!record) {
      res.status(404).json({ error: "This upload expired. Upload the track again." });
      return;
    }

    if (!isValidBpm(sourceBpm) || !isValidBpm(targetBpm)) {
      res.status(400).json({ error: "Source and target BPM must be between 40 and 260." });
      return;
    }

    const adjustedSourceBpm = adjustBpmForMode(sourceBpm, sourceMode);
    const normalizedTargetBpm = normalizeBpm(targetBpm);
    const normalizedMetronomeVolume = normalizeMetronomeVolume(metronomeVolume);
    const normalizedMetronomeSound = normalizeMetronomeSound(metronomeSound);
    const tempoFactor = calculateTempoFactor(adjustedSourceBpm, normalizedTargetBpm);
    const alignment = buildTempoAlignmentPlan({
      sourceBpm: adjustedSourceBpm,
      targetBpm: normalizedTargetBpm,
      sourceBeats: record.detectedBeats,
      durationSeconds: record.duration
    });
    const outputPath = createOutputFilePath(fileId);

    await convertTempo(record.inputPath, outputPath, {
      sourceBpm: adjustedSourceBpm,
      targetBpm: normalizedTargetBpm,
      sourceBeats: record.detectedBeats,
      durationSeconds: record.duration,
      mixMetronome: Boolean(mixMetronome),
      metronomeVolume: normalizedMetronomeVolume,
      metronomeSound: normalizedMetronomeSound
    });
    const stats = await fs.stat(outputPath);

    record.outputPath = outputPath;
    record.targetBpm = normalizedTargetBpm;
    record.adjustedSourceBpm = adjustedSourceBpm;
    record.tempoFactor = tempoFactor;
    record.alignment = alignment;
    record.metronomeMixed = Boolean(mixMetronome);
    record.metronomeVolume = normalizedMetronomeVolume;
    record.metronomeSound = normalizedMetronomeSound;
    record.outputSize = stats.size;
    files.set(fileId, record);

    res.json({
      fileId,
      originalName: record.originalName,
      adjustedSourceBpm,
      targetBpm: normalizedTargetBpm,
      tempoFactor,
      alignment,
      metronomeMixed: record.metronomeMixed,
      metronomeVolume: record.metronomeVolume,
      metronomeSound: record.metronomeSound,
      outputSize: stats.size,
      downloadUrl: `/api/download/${fileId}`
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/download/:fileId", (req, res) => {
  const record = files.get(req.params.fileId);

  if (!record?.outputPath) {
    res.status(404).json({ error: "No converted file is ready for this upload." });
    return;
  }

  const baseName = path.parse(record.originalName).name.replace(/[^\w.-]+/g, "-");
  res.download(record.outputPath, `${baseName || "track"}-${record.targetBpm}bpm.mp3`);
});

app.use(express.static(distPath, { index: false }));

app.get(/^(?!\/api(?:\/|$)).*/, async (req, res, next) => {
  try {
    const html = await fs.readFile(path.join(distPath, "index.html"), "utf8");
    const language = getLanguageFromPathname(req.path) || DEFAULT_LANGUAGE;
    res.type("html").send(decorateHtmlForSeo(html, language));
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const message = error instanceof Error ? error.message : "Unexpected server error.";

  if (message.includes("File too large")) {
    res.status(413).json({ error: "Audio files must be 80 MB or smaller." });
    return;
  }

  res.status(400).json({ error: message });
});

if (process.env.NODE_ENV !== "test") {
  const port = process.env.PORT || 4177;
  await clearStorage();
  app.listen(port, () => {
    console.log(`Beats Your Music API running at http://127.0.0.1:${port}`);
  });
}
