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
  await page.getByRole("button", { name: "High BPM diagram" }).waitFor();
  await page.getByRole("button", { name: "Low BPM diagram" }).waitFor();
  await page.getByText("Quick cadence pattern").waitFor();
  const runnerDiagram = page.getByRole("img", { name: "Human runner silhouette showing the selected BPM cadence diagram" });
  await runnerDiagram.waitFor();
  await page.getByText("Animation paced at 180 BPM").waitFor();
  if ((await runnerDiagram.getAttribute("data-bpm")) !== "180") {
    throw new Error("High BPM diagram should animate at 180 BPM.");
  }
  if ((await runnerDiagram.getAttribute("data-beat-duration")) !== "0.333s") {
    throw new Error("High BPM diagram should expose a 0.333s beat duration.");
  }
  await page.getByRole("button", { name: "Low BPM diagram" }).click();
  await page.getByText("Longer stride pattern").waitFor();
  await page.getByText("Animation paced at 90 BPM").waitFor();
  if ((await runnerDiagram.getAttribute("data-bpm")) !== "90") {
    throw new Error("Low BPM diagram should animate at 90 BPM.");
  }
  if ((await runnerDiagram.getAttribute("data-beat-duration")) !== "0.667s") {
    throw new Error("Low BPM diagram should expose a 0.667s beat duration.");
  }
  await page.getByRole("button", { name: "High BPM diagram" }).click();
  await page.getByText("Quick cadence pattern").waitFor();
  await page.getByText("Animation paced at 180 BPM").waitFor();
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
