import { DEFAULT_LANGUAGE, getLanguageDirection } from "../src/i18n.js";
import { getSeoAlternates, getSeoKeywords, getSeoPage, getSeoUrl } from "../src/seo.js";

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function safeJson(value) {
  return JSON.stringify(value, null, 6).replace(/</g, "\\u003c");
}

function replaceOrInsertHeadTag(html, pattern, tag) {
  if (pattern.test(html)) {
    return html.replace(pattern, tag);
  }

  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function buildAlternateLinks() {
  const links = [
    { hreflang: "x-default", href: getSeoUrl(DEFAULT_LANGUAGE) },
    ...getSeoAlternates()
  ];

  return links
    .map(
      (link) =>
        `<link rel="alternate" hreflang="${escapeAttribute(link.hreflang)}" href="${escapeAttribute(link.href)}" />`
    )
    .join("\n    ");
}

function buildStructuredData(page, canonicalUrl, keywords) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Beats Your Music",
    url: canonicalUrl,
    inLanguage: page.hreflang,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Any",
    description: page.description,
    keywords,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD"
    },
    featureList: [
      "Detect source BPM from uploaded audio",
      "Convert music to a target BPM such as 180 BPM",
      "Batch convert multiple audio tracks",
      "Mix optional electronic pulse or drum set metronome",
      "Preserve pitch while changing tempo"
    ]
  };
}

function buildNoscriptFallback(page, keywords) {
  return `<noscript>
      <main>
        <h1>${escapeAttribute(page.title)}</h1>
        <p>${escapeAttribute(page.description)}</p>
        <p>${escapeAttribute(keywords)}</p>
      </main>
    </noscript>`;
}

export function decorateHtmlForSeo(html, language = DEFAULT_LANGUAGE) {
  const page = getSeoPage(language);
  const canonicalUrl = getSeoUrl(page.language);
  const keywords = getSeoKeywords(page.language);
  const direction = getLanguageDirection(page.language);
  const structuredData = buildStructuredData(page, canonicalUrl, keywords);
  let nextHtml = html.replace(
    /<html\b[^>]*>/i,
    `<html lang="${escapeAttribute(page.hreflang)}" dir="${escapeAttribute(direction)}">`
  );

  nextHtml = replaceOrInsertHeadTag(
    nextHtml,
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeAttribute(page.title)}</title>`
  );
  nextHtml = replaceOrInsertHeadTag(
    nextHtml,
    /<meta\s+name=["']description["'][\s\S]*?>/i,
    `<meta name="description" content="${escapeAttribute(page.description)}" />`
  );
  nextHtml = replaceOrInsertHeadTag(
    nextHtml,
    /<meta\s+name=["']keywords["'][\s\S]*?>/i,
    `<meta name="keywords" content="${escapeAttribute(keywords)}" />`
  );
  nextHtml = replaceOrInsertHeadTag(
    nextHtml,
    /<link\s+rel=["']canonical["'][\s\S]*?>/i,
    `<link rel="canonical" href="${escapeAttribute(canonicalUrl)}" />`
  );
  nextHtml = replaceOrInsertHeadTag(
    nextHtml,
    /<meta\s+property=["']og:title["'][\s\S]*?>/i,
    `<meta property="og:title" content="${escapeAttribute(page.title)}" />`
  );
  nextHtml = replaceOrInsertHeadTag(
    nextHtml,
    /<meta\s+property=["']og:description["'][\s\S]*?>/i,
    `<meta property="og:description" content="${escapeAttribute(page.description)}" />`
  );
  nextHtml = replaceOrInsertHeadTag(
    nextHtml,
    /<meta\s+property=["']og:url["'][\s\S]*?>/i,
    `<meta property="og:url" content="${escapeAttribute(canonicalUrl)}" />`
  );
  nextHtml = replaceOrInsertHeadTag(
    nextHtml,
    /<meta\s+name=["']twitter:title["'][\s\S]*?>/i,
    `<meta name="twitter:title" content="${escapeAttribute(page.title)}" />`
  );
  nextHtml = replaceOrInsertHeadTag(
    nextHtml,
    /<meta\s+name=["']twitter:description["'][\s\S]*?>/i,
    `<meta name="twitter:description" content="${escapeAttribute(page.description)}" />`
  );

  const alternateLinks = buildAlternateLinks();
  if (/<!-- seo:alternates:start -->[\s\S]*?<!-- seo:alternates:end -->/i.test(nextHtml)) {
    nextHtml = nextHtml.replace(
      /<!-- seo:alternates:start -->[\s\S]*?<!-- seo:alternates:end -->/i,
      `<!-- seo:alternates:start -->\n    ${alternateLinks}\n    <!-- seo:alternates:end -->`
    );
  } else {
    nextHtml = nextHtml.replace(/<\/head>/i, `    ${alternateLinks}\n  </head>`);
  }

  const jsonLd = `<script type="application/ld+json">\n      ${safeJson(structuredData)}\n    </script>`;
  nextHtml = replaceOrInsertHeadTag(
    nextHtml,
    /<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i,
    jsonLd
  );
  nextHtml = nextHtml.replace(/<noscript>[\s\S]*?<\/noscript>/i, buildNoscriptFallback(page, keywords));

  return nextHtml;
}
