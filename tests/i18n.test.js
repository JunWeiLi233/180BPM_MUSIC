import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  createTranslator,
  detectLanguage,
  getLanguageDirection,
  translations
} from "../src/i18n.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("i18n", () => {
  it("selects the default language from browser preferences", () => {
    expect(detectLanguage(["es-MX", "en-US"])).toBe("es");
    expect(detectLanguage(["zh-Hans-CN", "en-US"])).toBe("zh");
    expect(detectLanguage(["zh-Hant-TW", "en-US"])).toBe("zh-Hant");
    expect(detectLanguage(["zh-Hant-HK", "en-US"])).toBe("zh-Hant");
    expect(detectLanguage(["de-AT", "en-US"])).toBe("de");
    expect(detectLanguage(["hi-IN", "en-US"])).toBe("hi");
    expect(detectLanguage(["fr-CA", "en-US"])).toBe("fr");
    expect(detectLanguage(["ar-EG", "en-US"])).toBe("ar");
    expect(detectLanguage(["bn-BD", "en-US"])).toBe("bn");
    expect(detectLanguage(["pt-BR", "en-US"])).toBe("pt");
    expect(detectLanguage(["ru-RU", "en-US"])).toBe("ru");
    expect(detectLanguage(["ur-PK", "en-US"])).toBe("ur");
    expect(detectLanguage(["it-IT", "en-US"])).toBe(DEFAULT_LANGUAGE);
  });

  it("falls back to English for unsupported languages", () => {
    expect(detectLanguage(["it-IT"])).toBe(DEFAULT_LANGUAGE);
    expect(detectLanguage([])).toBe(DEFAULT_LANGUAGE);
    expect(detectLanguage(null)).toBe(DEFAULT_LANGUAGE);
  });

  it("marks Arabic and Urdu as right-to-left languages", () => {
    expect(getLanguageDirection("ar")).toBe("rtl");
    expect(getLanguageDirection("ur")).toBe("rtl");
    expect(getLanguageDirection("en")).toBe("ltr");
    expect(getLanguageDirection("zh-Hant")).toBe("ltr");
  });

  it("includes complete translation keys for every supported language", () => {
    const englishKeys = Object.keys(translations.en).sort();

    for (const language of SUPPORTED_LANGUAGES) {
      const keys = Object.keys(translations[language.code]).sort();
      expect(keys).toEqual(englishKeys);

      for (const key of keys) {
        expect(translations[language.code][key], `${language.code}:${key}`).toBeTruthy();
        expect(translations[language.code][key], `${language.code}:${key}`).not.toContain("TODO");
      }
    }
  });

  it("translates core website copy and interpolated status text", () => {
    const es = createTranslator("es");
    const zh = createTranslator("zh");
    const de = createTranslator("de");

    expect(es("upload.heading")).toBe("Subir pistas");
    expect(zh("upload.heading")).toBe("上传音轨");
    expect(de("upload.heading")).toBe("Titel hochladen");
    expect(createTranslator("hi")("upload.heading")).toBe("ट्रैक अपलोड करें");
    expect(createTranslator("fr")("upload.heading")).toBe("Importer des pistes");
    expect(createTranslator("ar")("upload.heading")).toBe("تحميل المقاطع");
    expect(createTranslator("bn")("upload.heading")).toBe("ট্র্যাক আপলোড করুন");
    expect(createTranslator("pt")("upload.heading")).toBe("Enviar faixas");
    expect(createTranslator("ru")("upload.heading")).toBe("Загрузить треки");
    expect(createTranslator("ur")("upload.heading")).toBe("ٹریک اپ لوڈ کریں");
    expect(createTranslator("zh-Hant")("upload.heading")).toBe("上傳音軌");
    expect(es("status.tracksReady_other", { count: 2 })).toBe("2 pistas listas para convertir");
  });

  it("defines every static translation key used by the app shell", async () => {
    const appSource = await fs.readFile(path.join(__dirname, "../src/App.jsx"), "utf8");
    const keys = [
      ...appSource.matchAll(/\bt\("([^"]+)"/g),
      ...appSource.matchAll(/\bcreateMessage\("([^"]+)"/g)
    ].map((match) => match[1]);

    for (const key of keys) {
      expect(translations.en, key).toHaveProperty(key);
    }
  });
});
