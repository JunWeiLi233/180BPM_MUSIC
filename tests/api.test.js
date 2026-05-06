import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../server/index.js";
import { runFfmpeg } from "../server/audio-utils.js";

async function createClickTrack(filePath, bpm = 120, seconds = 8) {
  const intervalSeconds = 60 / bpm;
  const silenceSeconds = Math.max(0.01, intervalSeconds - 0.035);
  const loopSampleCount = Math.round(intervalSeconds * 44100);
  const loops = Math.ceil(seconds / intervalSeconds) + 2;

  await runFfmpeg([
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=1000:duration=0.035",
    "-f",
    "lavfi",
    "-i",
    `anullsrc=r=44100:cl=mono:duration=${silenceSeconds}`,
    "-filter_complex",
    `[0:a][1:a]concat=n=2:v=0:a=1[beat];[beat]aloop=loop=${loops}:size=${loopSampleCount}:start=0`,
    "-t",
    String(seconds),
    "-ac",
    "1",
    "-ar",
    "44100",
    filePath
  ]);
}

describe("audio conversion API", () => {
  it("detects supported tempos outside the library default range", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "beats-your-music-range-"));

    for (const bpm of [45, 240]) {
      const inputPath = path.join(tempDir, `click-${bpm}.wav`);
      await createClickTrack(inputPath, bpm, 32);

      const analyze = await request(app)
        .post("/api/analyze")
        .attach("track", inputPath)
        .expect(200);

      expect(analyze.body.detectedBpm).toBeCloseTo(bpm, 1);
      expect(analyze.body.detectionSource).toBe("analysis");
    }
  }, 60000);

  it("uses the BPM suffix when an app-converted MP3 is uploaded again", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "beats-your-music-reupload-"));
    const inputPath = path.join(tempDir, "runner-180bpm.mp3");
    await createClickTrack(inputPath);

    const analyze = await request(app)
      .post("/api/analyze")
      .attach("track", inputPath)
      .expect(200);

    expect(analyze.body.detectedBpm).toBe(180);
    expect(analyze.body.detectionSource).toBe("filename");
  }, 30000);

  it("analyzes and converts a generated click track", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "beats-your-music-"));
    const inputPath = path.join(tempDir, "click.wav");
    await createClickTrack(inputPath);

    const analyze = await request(app)
      .post("/api/analyze")
      .attach("track", inputPath)
      .expect(200);

    expect(analyze.body.fileId).toBeTruthy();
    expect(analyze.body.targetBpm).toBe(180);
    expect(analyze.body.detectedBpm).toBeGreaterThanOrEqual(40);
    expect(analyze.body.detectedBpm).toBeLessThanOrEqual(260);

    const convert = await request(app)
      .post("/api/convert")
      .send({
        fileId: analyze.body.fileId,
        sourceBpm: 120,
        targetBpm: 180,
        sourceMode: "normal",
        mixMetronome: true
      })
      .expect(200);

    expect(convert.body.tempoFactor).toBe(1.5);
    expect(convert.body.metronomeMixed).toBe(true);
    expect(convert.body.alignment.tempoFactor).toBe(1.5);
    expect(convert.body.alignment.targetBpm).toBe(180);
    expect(convert.body.alignment.metronomeGridSeconds.length).toBeGreaterThan(5);
    expect(convert.body.alignment.sourceFirstBeatSeconds).toBeTypeOf("number");
    expect(convert.body.downloadUrl).toBe(`/api/download/${analyze.body.fileId}`);
    expect(convert.body.outputSize).toBeGreaterThan(1000);

    await request(app).get(convert.body.downloadUrl).expect(200);
  }, 30000);
});
