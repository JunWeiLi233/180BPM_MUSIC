import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, getLanguagePath } from "./i18n.js";

export const SITE_ORIGIN = "https://beatsyourmusic.com";

export const HIGH_BPM_SEO_PAGE = {
  path: "/why-high-bpm/",
  language: "en",
  hreflang: "en",
  title: "Why High BPM Music Helps Running | Beats Your Music",
  description:
    "Learn why high BPM music helps new runners keep a quicker running cadence, avoid low-BPM overstriding, and choose better workout tempo targets.",
  keywords: [
    "high BPM music",
    "running cadence",
    "180 BPM running",
    "high BPM running songs",
    "low BPM running",
    "music for running pace"
  ]
};

export const SEO_LANGUAGE_PAGES = [
  {
    language: "en",
    hreflang: "en",
    title: "Beats Your Music | Free Online BPM Converter for Running Music",
    description:
      "Free online BPM converter for runners. Upload audio, detect source tempo, convert music to 180 BPM or any target BPM, and download pitch-preserved MP3 files.",
    keywords: [
      "BPM converter",
      "BPM convertor",
      "online BPM converter",
      "180 BPM running music",
      "music tempo changer",
      "song BPM changer",
      "MP3 BPM converter",
      "running cadence music"
    ]
  },
  {
    language: "es",
    hreflang: "es",
    title: "Beats Your Music | Convertidor de BPM online gratis",
    description:
      "Convertidor de BPM online gratis para correr y entrenar. Detecta el tempo, convierte música a 180 BPM u otro BPM objetivo y descarga MP3 con el tono conservado.",
    keywords: [
      "convertidor de BPM",
      "convertir BPM",
      "convertidor BPM online",
      "música para correr 180 BPM",
      "cambiar tempo de música",
      "convertir tempo de canción"
    ]
  },
  {
    language: "zh",
    hreflang: "zh-Hans",
    title: "Beats Your Music | 免费在线 BPM 转换器",
    description:
      "免费在线 BPM 转换器，适合跑步和训练。上传音频，检测歌曲速度，转换为 180 BPM 或自定义 BPM，并下载保留音高的 MP3。",
    keywords: [
      "BPM转换器",
      "在线BPM转换",
      "音乐变速器",
      "180 BPM跑步音乐",
      "歌曲BPM修改",
      "MP3 BPM转换"
    ]
  },
  {
    language: "zh-Hant",
    hreflang: "zh-Hant",
    title: "Beats Your Music | 免費線上 BPM 轉換器",
    description:
      "免費線上 BPM 轉換器，適合跑步和訓練。上傳音訊，偵測歌曲速度，轉換為 180 BPM 或自訂 BPM，並下載保留音高的 MP3。",
    keywords: [
      "BPM轉換器",
      "線上BPM轉換",
      "音樂變速器",
      "180 BPM跑步音樂",
      "歌曲BPM修改",
      "MP3 BPM轉換"
    ]
  },
  {
    language: "de",
    hreflang: "de",
    title: "Beats Your Music | Kostenloser Online-BPM-Konverter",
    description:
      "Kostenloser Online-BPM-Konverter für Laufmusik und Training. Tempo erkennen, Musik auf 180 BPM oder ein Zieltempo konvertieren und MP3 mit erhaltener Tonhöhe laden.",
    keywords: [
      "BPM Converter",
      "BPM umwandeln",
      "Online BPM Konverter",
      "180 BPM Laufmusik",
      "Musik Tempo ändern",
      "Song BPM ändern"
    ]
  },
  {
    language: "hi",
    hreflang: "hi",
    title: "Beats Your Music | मुफ़्त ऑनलाइन BPM कन्वर्टर",
    description:
      "दौड़ने और वर्कआउट के लिए मुफ़्त ऑनलाइन BPM कन्वर्टर। ऑडियो अपलोड करें, टेम्पो पहचानें, संगीत को 180 BPM या लक्ष्य BPM में बदलें और पिच सुरक्षित MP3 डाउनलोड करें।",
    keywords: [
      "BPM कन्वर्टर",
      "ऑनलाइन BPM कन्वर्टर",
      "180 BPM रनिंग म्यूजिक",
      "संगीत टेम्पो बदलें",
      "गाने का BPM बदलें",
      "MP3 BPM कन्वर्टर"
    ]
  },
  {
    language: "fr",
    hreflang: "fr",
    title: "Beats Your Music | Convertisseur BPM en ligne gratuit",
    description:
      "Convertisseur BPM en ligne gratuit pour la course et l'entraînement. Détectez le tempo, convertissez la musique en 180 BPM ou vers un BPM cible, puis téléchargez un MP3 à hauteur préservée.",
    keywords: [
      "convertisseur BPM",
      "convertir BPM",
      "convertisseur BPM en ligne",
      "musique course 180 BPM",
      "changer tempo musique",
      "changer BPM chanson"
    ]
  },
  {
    language: "ar",
    hreflang: "ar",
    title: "Beats Your Music | محول BPM مجاني عبر الإنترنت",
    description:
      "محول BPM مجاني عبر الإنترنت لموسيقى الجري والتمارين. ارفع الصوت، واكتشف الإيقاع، وحوّل الموسيقى إلى 180 BPM أو BPM مخصص، ثم نزّل MP3 مع الحفاظ على الطبقة.",
    keywords: [
      "محول BPM",
      "تحويل BPM",
      "محول BPM اونلاين",
      "موسيقى الجري 180 BPM",
      "تغيير سرعة الموسيقى",
      "تغيير BPM الأغنية"
    ]
  },
  {
    language: "bn",
    hreflang: "bn",
    title: "Beats Your Music | বিনামূল্যের অনলাইন BPM কনভার্টার",
    description:
      "দৌড় ও ওয়ার্কআউটের জন্য বিনামূল্যের অনলাইন BPM কনভার্টার। অডিও আপলোড করুন, টেম্পো শনাক্ত করুন, 180 BPM বা লক্ষ্য BPM-এ রূপান্তর করুন এবং পিচ-সংরক্ষিত MP3 ডাউনলোড করুন।",
    keywords: [
      "BPM কনভার্টার",
      "অনলাইন BPM কনভার্টার",
      "180 BPM দৌড়ের গান",
      "গানের টেম্পো বদলান",
      "গানের BPM বদলান",
      "MP3 BPM কনভার্টার"
    ]
  },
  {
    language: "pt",
    hreflang: "pt",
    title: "Beats Your Music | Conversor de BPM online gratuito",
    description:
      "Conversor de BPM online gratuito para corrida e treinos. Envie áudio, detecte o tempo, converta músicas para 180 BPM ou outro BPM alvo e baixe MP3 com a altura preservada.",
    keywords: [
      "conversor de BPM",
      "converter BPM",
      "conversor BPM online",
      "música corrida 180 BPM",
      "alterar tempo da música",
      "mudar BPM da música"
    ]
  },
  {
    language: "ru",
    hreflang: "ru",
    title: "Beats Your Music | Бесплатный онлайн-конвертер BPM",
    description:
      "Бесплатный онлайн-конвертер BPM для бега и тренировок. Загружайте аудио, определяйте темп, конвертируйте музыку в 180 BPM или другой BPM и скачивайте MP3 с сохраненной высотой тона.",
    keywords: [
      "BPM конвертер",
      "изменить BPM",
      "онлайн конвертер BPM",
      "музыка для бега 180 BPM",
      "изменить темп музыки",
      "изменить BPM песни"
    ]
  },
  {
    language: "ur",
    hreflang: "ur",
    title: "Beats Your Music | مفت آن لائن BPM کنورٹر",
    description:
      "دوڑ اور ورزش کے لیے مفت آن لائن BPM کنورٹر۔ آڈیو اپ لوڈ کریں، ٹیمپو معلوم کریں، موسیقی کو 180 BPM یا ہدف BPM میں بدلیں، اور پچ محفوظ MP3 ڈاؤن لوڈ کریں۔",
    keywords: [
      "BPM کنورٹر",
      "آن لائن BPM کنورٹر",
      "180 BPM دوڑنے کی موسیقی",
      "موسیقی کا ٹیمپو بدلیں",
      "گانے کا BPM بدلیں",
      "MP3 BPM کنورٹر"
    ]
  }
];

const SUPPORTED_LANGUAGE_CODES = new Set(SUPPORTED_LANGUAGES.map((language) => language.code));
const SEO_PAGE_BY_LANGUAGE = new Map(SEO_LANGUAGE_PAGES.map((page) => [page.language, page]));

export function getSeoPage(language = DEFAULT_LANGUAGE) {
  return SEO_PAGE_BY_LANGUAGE.get(language) || SEO_PAGE_BY_LANGUAGE.get(DEFAULT_LANGUAGE);
}

export function getStaticSeoPage(pathname = "") {
  const normalizedPath = `/${String(pathname)
    .split(/[?#]/)[0]
    .split("/")
    .filter(Boolean)
    .join("/")}/`;

  return normalizedPath === HIGH_BPM_SEO_PAGE.path ? HIGH_BPM_SEO_PAGE : null;
}

export function getSeoUrl(language = DEFAULT_LANGUAGE) {
  return `${SITE_ORIGIN}${getLanguagePath(language)}`;
}

export function getSeoAlternates() {
  return SEO_LANGUAGE_PAGES
    .filter((page) => SUPPORTED_LANGUAGE_CODES.has(page.language))
    .map((page) => ({
      hreflang: page.hreflang,
      href: getSeoUrl(page.language)
    }));
}

export function getSeoKeywords(language = DEFAULT_LANGUAGE) {
  return getSeoPage(language).keywords.join(", ");
}
