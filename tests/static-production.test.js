import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../server/index.js";

const distDir = path.join(process.cwd(), "dist");
const indexPath = path.join(distDir, "index.html");
const testHtml = "<!doctype html><html><head><title>Render Ready</title></head><body>Beats Your Music Render</body></html>";

describe("production static hosting", () => {
  beforeAll(async () => {
    await fs.mkdir(distDir, { recursive: true });
    await fs.writeFile(indexPath, testHtml);
  });

  afterAll(async () => {
    await fs.rm(indexPath, { force: true });
  });

  it("serves the built React app from Express", async () => {
    const response = await request(app).get("/").expect(200);

    expect(response.text).toContain("Beats Your Music Render");
    expect(response.headers["content-type"]).toContain("text/html");
  });
});
