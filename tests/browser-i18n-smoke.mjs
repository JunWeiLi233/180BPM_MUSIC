import { chromium } from "playwright";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function main() {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true
  });
  const context = await browser.newContext({
    locale: "es-MX",
    viewport: { width: 1280, height: 900 }
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
  await page.getByRole("heading", { name: "Subir pistas" }).waitFor();
  await page.getByText("Arrastra y suelta archivos de audio").waitFor();

  if (await page.getByRole("heading", { name: "Upload tracks" }).count()) {
    throw new Error("Spanish browser locale still rendered English upload heading.");
  }

  await page.getByLabel("Idioma").selectOption("de");
  await page.getByRole("heading", { name: "Titel hochladen" }).waitFor();
  await page.getByText("Audiodateien hier ablegen").waitFor();

  await page.getByLabel("Sprache").selectOption("zh");
  await page.getByRole("heading", { name: "上传音轨" }).waitFor();
  await page.getByText("拖放音频文件").waitFor();

  await page.getByLabel("语言").selectOption("zh-Hant");
  await page.getByRole("heading", { name: "上傳音軌" }).waitFor();
  await page.getByText("拖放音訊檔案").waitFor();

  await page.getByLabel("語言").selectOption("hi");
  await page.getByRole("heading", { name: "ट्रैक अपलोड करें" }).waitFor();
  await page.getByText("ऑडियो फ़ाइलें खींचकर छोड़ें").waitFor();

  await page.getByLabel("भाषा").selectOption("fr");
  await page.getByRole("heading", { name: "Importer des pistes" }).waitFor();
  await page.getByText("Glissez-déposez des fichiers audio").waitFor();

  await page.getByLabel("Langue").selectOption("ar");
  await page.getByRole("heading", { name: "تحميل المقاطع" }).waitFor();
  await page.getByText("اسحب ملفات الصوت وأفلتها").waitFor();
  const arabicDir = await page.locator("html").getAttribute("dir");
  if (arabicDir !== "rtl") {
    throw new Error(`Arabic should set document direction to rtl, found ${arabicDir}.`);
  }

  await page.getByLabel("اللغة").selectOption("bn");
  await page.getByRole("heading", { name: "ট্র্যাক আপলোড করুন" }).waitFor();
  await page.getByText("অডিও ফাইল টেনে এনে ছেড়ে দিন").waitFor();

  await page.getByLabel("ভাষা").selectOption("pt");
  await page.getByRole("heading", { name: "Enviar faixas" }).waitFor();
  await page.getByText("Arraste e solte arquivos de áudio").waitFor();

  await page.getByLabel("Idioma").selectOption("ru");
  await page.getByRole("heading", { name: "Загрузить треки" }).waitFor();
  await page.getByText("Перетащите аудиофайлы").waitFor();

  await page.getByLabel("Язык").selectOption("ur");
  await page.getByRole("heading", { name: "ٹریک اپ لوڈ کریں" }).waitFor();
  await page.getByText("آڈیو فائلیں گھسیٹ کر چھوڑیں").waitFor();
  const urduDir = await page.locator("html").getAttribute("dir");
  if (urduDir !== "rtl") {
    throw new Error(`Urdu should set document direction to rtl, found ${urduDir}.`);
  }

  await browser.close();

  if (consoleErrors.length || pageErrors.length) {
    throw new Error(`Browser errors: ${[...consoleErrors, ...pageErrors].join(" | ")}`);
  }

  console.log("Browser i18n smoke passed: browser default and all supported language switches.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
