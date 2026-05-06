import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { runFfmpeg } from "../server/audio-utils.js";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

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

async function main() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "beats-browser-"));
  const audioPath = path.join(tempDir, "runner-click.wav");
  await createClickTrack(audioPath);

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Beats Your Music" }).waitFor();
  await page.getByLabel("Default target BPM is 180").waitFor();
  if (await page.getByText("Processed on this localhost server").count()) {
    throw new Error("Hosted UI still shows localhost processing copy.");
  }

  await page.locator('input[type="file"]').setInputFiles(audioPath);
  await page.getByText("Ready to convert").waitFor({ timeout: 20000 });

  await page.getByLabel("Source BPM").fill("120");
  await page.getByRole("button", { name: "Convert to 180 BPM" }).click();
  await page.getByRole("link", { name: "Download", exact: true }).waitFor({ timeout: 30000 });
  await page.getByText("Metronome aligned").waitFor({ timeout: 30000 });

  const href = await page.getByRole("link", { name: "Download", exact: true }).getAttribute("href");
  if (!href?.startsWith("/api/download/")) {
    throw new Error(`Unexpected download href: ${href}`);
  }

  await fs.mkdir("docs/superpowers", { recursive: true });
  await page.screenshot({ path: "docs/superpowers/beats-your-music-browser-smoke.png", fullPage: true });
  await browser.close();

  if (consoleErrors.length || pageErrors.length) {
    throw new Error(`Browser errors: ${[...consoleErrors, ...pageErrors].join(" | ")}`);
  }

  console.log("Browser smoke passed: upload, analyze, convert, download link, screenshot.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
