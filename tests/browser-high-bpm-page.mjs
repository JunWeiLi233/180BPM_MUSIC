import { chromium } from "playwright";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function main() {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true
  });
  const context = await browser.newContext({
    locale: "en-US",
    viewport: { width: 1360, height: 900 }
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

  await page.goto("http://127.0.0.1:5173/why-high-bpm/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Why high-BPM music helps running" }).waitFor();
  await page.getByText("High-BPM music gives new runners a steady external cue").waitFor();
  await page.getByText("High BPM: quicker cadence").waitFor();
  await page.getByText("Low BPM: longer, heavier steps").waitFor();
  await page.getByRole("img", { name: "Runner comparing high BPM cadence with low BPM cadence" }).waitFor();
  await page.getByRole("link", { name: "Start converting music" }).click();
  await page.getByRole("heading", { name: "Beats Your Music" }).waitFor();

  await context.close();
  await browser.close();

  if (consoleErrors.length || pageErrors.length) {
    throw new Error(`Browser errors: ${[...consoleErrors, ...pageErrors].join(" | ")}`);
  }

  console.log("Browser high-BPM page smoke passed: explainer route, SVG, and converter link.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
