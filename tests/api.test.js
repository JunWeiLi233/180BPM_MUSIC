import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../server/index.js";
import { runFfmpeg } from "../server/audio-utils.js";

async function createClickTrack(filePath) {
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
    "anullsrc=r=44100:cl=mono:duration=0.465",
    "-filter_complex",
    "[0:a][1:a]concat=n=2:v=0:a=1[beat];[beat]aloop=loop=15:size=22050:start=0",
    "-t",
    "8",
    "-ac",
    "1",
    "-ar",
    "44100",
    filePath
  ]);
}

describe("audio conversion API", () => {
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
        sourceMode: "normal"
      })
      .expect(200);

    expect(convert.body.tempoFactor).toBe(1.5);
    expect(convert.body.downloadUrl).toBe(`/api/download/${analyze.body.fileId}`);
    expect(convert.body.outputSize).toBeGreaterThan(1000);

    await request(app).get(convert.body.downloadUrl).expect(200);
  }, 30000);
});

