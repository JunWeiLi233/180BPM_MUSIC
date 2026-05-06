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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "beats-browser-multi-"));
  const firstPath = path.join(tempDir, "runner-click-a.wav");
  const secondPath = path.join(tempDir, "runner-click-b.wav");
  await createClickTrack(firstPath);
  await createClickTrack(secondPath);

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true
  });

  const context = await browser.newContext({
    locale: "en-US",
    viewport: { width: 1121, height: 1100 }
  });
  const page = await context.newPage();
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

  await page.locator('input[type="file"]').setInputFiles([firstPath, secondPath]);
  const queue = page.getByLabel("Uploaded audio files");
  await queue.getByText("runner-click-a.wav").waitFor({ timeout: 25000 });
  await queue.getByText("runner-click-b.wav").waitFor({ timeout: 25000 });
  await page.getByText("2 tracks loaded").waitFor({ timeout: 25000 });

  const activeTrackLayout = await page.locator(".track-strip.is-active").evaluate((row) => {
    const meta = row.querySelector(".track-meta");

    return {
      clientWidth: row.clientWidth,
      scrollWidth: row.scrollWidth,
      metaClientWidth: meta?.clientWidth ?? 0
    };
  });
  if (activeTrackLayout.scrollWidth > activeTrackLayout.clientWidth) {
    throw new Error(
      `Active track row overflowed: ${activeTrackLayout.scrollWidth}px content in ${activeTrackLayout.clientWidth}px row.`
    );
  }
  if (activeTrackLayout.metaClientWidth < 160) {
    throw new Error(
      `Active track metadata collapsed to ${activeTrackLayout.metaClientWidth}px at constrained desktop width.`
    );
  }

  const convertButtons = queue.getByRole("button", { name: "Convert to 180 BPM" });
  const count = await convertButtons.count();
  if (count !== 2) {
    throw new Error(`Expected 2 convert buttons, found ${count}`);
  }

  await convertButtons.nth(0).click();
  await page.getByRole("link", { name: "Download MP3" }).waitFor({ timeout: 30000 });

  await convertButtons.nth(1).click();
  const downloads = page.getByRole("link", { name: "Download MP3" });
  await downloads.nth(1).waitFor({ timeout: 30000 });
  const downloadCount = await downloads.count();
  if (downloadCount !== 2) {
    throw new Error(`Expected 2 row download links, found ${downloadCount}`);
  }

  await fs.mkdir("docs/superpowers", { recursive: true });
  await page.screenshot({ path: "docs/superpowers/beats-your-music-browser-multi-smoke.png", fullPage: true });
  await context.close();
  await browser.close();

  if (consoleErrors.length || pageErrors.length) {
    throw new Error(`Browser errors: ${[...consoleErrors, ...pageErrors].join(" | ")}`);
  }

  console.log("Browser multi-file smoke passed: two files loaded, converted, and exposed as downloads.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
