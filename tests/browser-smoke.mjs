import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { runFfmpeg } from "../server/audio-utils.js";
import { createTranslator } from "../src/i18n.js";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

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
  const secondAudioPath = path.join(tempDir, "runner-click-next.wav");
  const conversionAudioPath = path.join(tempDir, "runner-click-convert.wav");
  const zh = createTranslator("zh");
  await createClickTrack(audioPath);
  await createClickTrack(secondAudioPath);
  await createClickTrack(conversionAudioPath);

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true
  });

  const context = await browser.newContext({
    locale: "en-US",
    viewport: { width: 1440, height: 980 }
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
  await page.getByLabel("Default target BPM is 180").waitFor();
  if (await page.getByText("Processed on this localhost server").count()) {
    throw new Error("Hosted UI still shows localhost processing copy.");
  }

  await page.getByLabel("Language").selectOption("zh");
  await page.getByRole("heading", { name: zh("upload.heading") }).waitFor();

  let delayedAnalyze = true;
  await page.route("**/api/analyze", async (route) => {
    if (delayedAnalyze) {
      delayedAnalyze = false;
      await delay(1200);
    }
    await route.continue();
  });

  const delayedAnalyzeResponse = page.waitForResponse("**/api/analyze");
  await page.locator('input[type="file"]').setInputFiles(audioPath);
  await page.getByRole("button", { name: zh("track.removeAria", { name: "runner-click.wav" }) }).click();
  await page.getByText(zh("upload.emptyTitle")).waitFor();
  await page.getByText(zh("status.ready"), { exact: true }).waitFor({ timeout: 5000 });
  await delayedAnalyzeResponse;
  await page.waitForTimeout(500);
  if (await page.getByText(zh("status.tracksReady_one", { count: 1 }), { exact: true }).count()) {
    throw new Error("Removed track reappeared in processing status after delayed analysis completed.");
  }

  await page.unroute("**/api/analyze");

  await page.locator('input[type="file"]').setInputFiles(secondAudioPath);
  await page.getByText(zh("status.tracksReady_one", { count: 1 }), { exact: true }).waitFor({ timeout: 20000 });
  await page
    .getByRole("button", { name: zh("track.removeAria", { name: "runner-click-next.wav" }) })
    .click();
  await page.getByText(zh("upload.emptyTitle")).waitFor();
  await page.getByText(zh("status.ready"), { exact: true }).waitFor({ timeout: 5000 });
  await page
    .getByText(zh("status.tracksReady_one", { count: 1 }), { exact: true })
    .waitFor({ state: "hidden", timeout: 5000 });

  await page.getByLabel(zh("language.label")).selectOption("en");
  await page.getByRole("heading", { name: "Upload tracks" }).waitFor();

  await page.locator('input[type="file"]').setInputFiles(conversionAudioPath);
  await page.getByText("Ready to convert").waitFor({ timeout: 20000 });

  await page.getByLabel("Source BPM").fill("120");
  await page.getByLabel("Mix metronome into converted audio").check();
  await page.getByRole("button", { name: "Drum set" }).click();
  await page.getByRole("button", { name: "High" }).click();
  await page.getByRole("button", { name: "Convert to 180 BPM" }).click();
  await page.getByRole("link", { name: "Download", exact: true }).waitFor({ timeout: 30000 });
  await page.getByText("Metronome aligned").waitFor({ timeout: 30000 });
  await page.getByText("Metronome mixed").waitFor({ timeout: 30000 });
  await page.getByText("Drum set metronome at High level").waitFor({ timeout: 30000 });

  const href = await page.getByRole("link", { name: "Download", exact: true }).getAttribute("href");
  if (!href?.startsWith("/api/download/")) {
    throw new Error(`Unexpected download href: ${href}`);
  }

  await fs.mkdir("docs/superpowers", { recursive: true });
  await page.screenshot({ path: "docs/superpowers/beats-your-music-browser-smoke.png", fullPage: true });
  await context.close();
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
