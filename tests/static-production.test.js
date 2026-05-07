import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../server/index.js";
import { SUPPORTED_LANGUAGES } from "../src/i18n.js";
import { SEO_LANGUAGE_PAGES } from "../src/seo.js";

const distDir = path.join(process.cwd(), "dist");
const indexPath = path.join(distDir, "index.html");
const rootIndexPath = path.join(process.cwd(), "index.html");
const robotsPath = path.join(process.cwd(), "public", "robots.txt");
const sitemapPath = path.join(process.cwd(), "public", "sitemap.xml");
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

describe("search engine metadata", () => {
  it("defines canonical, social preview, and structured data metadata", async () => {
    const html = await fs.readFile(rootIndexPath, "utf8");
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);

    expect(html).toContain("<title>Beats Your Music | Free Online BPM Converter for Running Music</title>");
    expect(html).toContain('<meta name="robots" content="index, follow" />');
    expect(html).toContain('<link rel="canonical" href="https://beatsyourmusic.com/" />');
    expect(html).toContain('<link rel="alternate" hreflang="fr" href="https://beatsyourmusic.com/fr/" />');
    expect(html).toContain('<meta\n      name="keywords"');
    expect(html).toContain("BPM convertor");
    expect(html).toContain("free online BPM converter");
    expect(html).toContain("180 BPM");
    expect(html).toContain('<meta property="og:type" content="website" />');
    expect(html).toContain('<meta property="og:url" content="https://beatsyourmusic.com/" />');
    expect(html).toContain('<meta name="twitter:card" content="summary" />');
    expect(jsonLdMatch).not.toBeNull();

    const structuredData = JSON.parse(jsonLdMatch[1]);
    expect(structuredData["@type"]).toBe("WebApplication");
    expect(structuredData.name).toBe("Beats Your Music");
    expect(structuredData.url).toBe("https://beatsyourmusic.com/");
    expect(structuredData.keywords).toContain("BPM converter");
    expect(structuredData.featureList).toContain("Batch convert multiple audio tracks");
  });

  it("publishes crawler directives and a sitemap for the production domain", async () => {
    const [robots, sitemap] = await Promise.all([
      fs.readFile(robotsPath, "utf8"),
      fs.readFile(sitemapPath, "utf8")
    ]);

    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Sitemap: https://beatsyourmusic.com/sitemap.xml");
    expect(sitemap).toContain("<loc>https://beatsyourmusic.com/</loc>");
    expect(sitemap).toContain("<loc>https://beatsyourmusic.com/fr/</loc>");
    expect(sitemap).toContain("<loc>https://beatsyourmusic.com/hi/</loc>");
    expect(sitemap).toContain("<loc>https://beatsyourmusic.com/ar/</loc>");
    expect(sitemap).toContain("<loc>https://beatsyourmusic.com/why-high-bpm/</loc>");
    expect(sitemap).toContain("<lastmod>2026-05-06</lastmod>");
  });

  it("has keyword metadata for every supported language route", () => {
    const seoLanguages = SEO_LANGUAGE_PAGES.map((page) => page.language).sort();
    const supportedLanguages = SUPPORTED_LANGUAGES.map((language) => language.code).sort();

    expect(seoLanguages).toEqual(supportedLanguages);
    for (const page of SEO_LANGUAGE_PAGES) {
      expect(page.title).toContain("Beats Your Music");
      expect(page.description).toContain("BPM");
      expect(page.keywords.length).toBeGreaterThanOrEqual(5);
      expect(page.keywords.join(" ")).toContain("BPM");
    }
  });

  it("serves localized SEO metadata on language routes", async () => {
    await fs.mkdir(distDir, { recursive: true });
    await fs.writeFile(indexPath, testHtml);

    try {
      const french = await request(app).get("/fr/").expect(200);
      const arabic = await request(app).get("/ar/").expect(200);

      expect(french.text).toContain('<html lang="fr" dir="ltr">');
      expect(french.text).toContain("<title>Beats Your Music | Convertisseur BPM en ligne gratuit</title>");
      expect(french.text).toContain('<link rel="canonical" href="https://beatsyourmusic.com/fr/" />');
      expect(french.text).toContain("convertisseur BPM");
      expect(arabic.text).toContain('<html lang="ar" dir="rtl">');
      expect(arabic.text).toContain('<link rel="canonical" href="https://beatsyourmusic.com/ar/" />');
      expect(arabic.text).toContain("محول BPM");
    } finally {
      await fs.rm(indexPath, { force: true });
    }
  });

  it("serves dedicated SEO metadata on the high-BPM explainer page", async () => {
    await fs.mkdir(distDir, { recursive: true });
    await fs.writeFile(indexPath, testHtml);

    try {
      const response = await request(app).get("/why-high-bpm/").expect(200);

      expect(response.text).toContain("<title>Why High BPM Music Helps Running | Beats Your Music</title>");
      expect(response.text).toContain('<link rel="canonical" href="https://beatsyourmusic.com/why-high-bpm/" />');
      expect(response.text).toContain("running cadence");
      expect(response.text).toContain("high BPM music");
    } finally {
      await fs.rm(indexPath, { force: true });
    }
  });
});
