import { useEffect, useMemo, useRef, useState } from "react";
import {
  SUPPORTED_LANGUAGES,
  createTranslator,
  getInitialLanguage,
  getLanguageDirection
} from "./i18n.js";
import { getSeoPage } from "./seo.js";

const DEFAULT_TARGET_BPM = 180;
const METRONOME_VOLUME_LEVELS = ["low", "medium", "high"];
const METRONOME_SOUND_TYPES = ["pulse", "drum"];
const ACCEPTED_TYPES = "audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.aiff,.aif";
const LANGUAGE_STORAGE_KEY = "beats-your-music-language";

const SERVER_ERROR_KEYS = {
  "BPM analysis failed.": "error.bpmAnalysisFailed",
  "Conversion failed.": "error.conversionFailed",
  "Source and target BPM must be between 40 and 260.": "error.sourceTargetBpm",
  "This upload expired. Upload the track again.": "error.uploadExpired",
  "Choose an audio file to analyze.": "error.chooseAudio",
  "Upload a supported audio file.": "error.supportedAudio",
  "Audio files must be 80 MB or smaller.": "error.fileTooLarge"
};

function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDuration(seconds, t) {
  if (!Number.isFinite(seconds)) return t("track.unknownLength");
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remaining = String(rounded % 60).padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function clampBpm(value) {
  if (value === "") return "";
  const bpm = Number(value);
  if (!Number.isFinite(bpm)) return "";
  return Math.min(260, Math.max(40, bpm));
}

function stepTargetBpm(value, delta) {
  const bpm = Number(value || DEFAULT_TARGET_BPM);
  const base = Number.isFinite(bpm) ? bpm : DEFAULT_TARGET_BPM;
  return clampBpm(Math.round(base + delta));
}

function sourceModeLabel(mode) {
  if (mode === "half") return "1/2x";
  if (mode === "double") return "2x";
  return "1x";
}

function adjustedSourceBpm(bpm, mode) {
  const value = Number(bpm);
  if (!Number.isFinite(value)) return null;
  if (mode === "half") return value / 2;
  if (mode === "double") return value * 2;
  return value;
}

function createClientId(file, index) {
  return `${Date.now()}-${index}-${file.name}-${file.size}`.replace(/[^\w.-]/g, "-");
}

function isSupportedAudio(file) {
  return file.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|flac|aiff|aif)$/i.test(file.name);
}

function withTrackDefaults(track) {
  return {
    ...track,
    sourceBpm: track.detectedBpm || "",
    targetBpm: track.targetBpm || DEFAULT_TARGET_BPM,
    sourceMode: "normal",
    mixMetronome: Boolean(track.mixMetronome),
    metronomeVolume: track.metronomeVolume || "medium",
    metronomeSound: track.metronomeSound || "pulse",
    phase: track.phase || "ready",
    result: null,
    error: null
  };
}

function canConvertTrack(track) {
  if (!track || track.phase === "analyzing" || track.phase === "converting" || !track.fileId) {
    return false;
  }

  const adjustedSource = adjustedSourceBpm(track.sourceBpm, track.sourceMode);
  return adjustedSource >= 40 && adjustedSource <= 260 && track.targetBpm >= 40 && track.targetBpm <= 260;
}

function pluralKey(baseKey, count) {
  return `${baseKey}_${count === 1 ? "one" : "other"}`;
}

function createMessage(key, values = {}) {
  return { key, values };
}

function isTrackCountStatus(message, baseKey) {
  return message?.key === `${baseKey}_one` || message?.key === `${baseKey}_other`;
}

function statusAfterTrackRemoval(remainingTracks, currentStatus) {
  if (!remainingTracks.length) {
    return createMessage("status.ready");
  }

  if (isTrackCountStatus(currentStatus, "status.analyzing")) {
    const analyzingCount = remainingTracks.filter((track) => track.phase === "analyzing").length;
    return analyzingCount
      ? createMessage(pluralKey("status.analyzing", analyzingCount), { count: analyzingCount })
      : createMessage("status.ready");
  }

  if (isTrackCountStatus(currentStatus, "status.tracksReady")) {
    const readyCount = remainingTracks.filter((track) => canConvertTrack(track)).length;
    if (readyCount) {
      return createMessage(pluralKey("status.tracksReady", readyCount), { count: readyCount });
    }
    return remainingTracks.some((track) => track.phase === "error")
      ? createMessage("status.analyzeFailed")
      : createMessage("status.ready");
  }

  return currentStatus;
}

function createErrorMessage(message, fallbackKey) {
  const key = SERVER_ERROR_KEYS[message] || fallbackKey;
  return key ? createMessage(key) : { fallback: message };
}

function renderMessage(message, t) {
  if (!message) return "";
  if (typeof message === "string") return message;
  if (message.key) return t(message.key, message.values);
  return message.fallback || "";
}

function persistLanguage(language) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Language selection still works for the current session if storage is unavailable.
  }
}

function isHighBpmRoute(pathname = "") {
  return String(pathname).replace(/\/+$/, "") === "/why-high-bpm";
}

function RunnerCadenceSvg({ mode }) {
  const isHigh = mode === "high";

  return (
    <svg
      className="runner-cadence-svg"
      viewBox="0 0 720 520"
      role="img"
      aria-label="Human runner silhouette showing the selected BPM cadence diagram"
    >
      <defs>
        <linearGradient id="stride-energy" x1="92" x2="640" y1="84" y2="438" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9cf032" />
          <stop offset="1" stopColor="#f5c64a" />
        </linearGradient>
      </defs>
      <rect className="cadence-skyline" x="54" y="64" width="612" height="392" rx="28" />

      {isHigh ? (
        <g className="cadence-diagram is-high">
          <text x="108" y="124">Quick cadence pattern</text>
          <path className="high-bpm-line" d="M90 354 C158 314 220 314 288 354 S426 394 498 354 598 314 636 338" />
          <g className="high-strides" aria-hidden="true">
            {[110, 164, 218, 272, 326, 380, 434, 488, 542, 596].map((x) => (
              <line key={x} x1={x} x2={x + 24} y1="408" y2="408" />
            ))}
          </g>
          <text className="diagram-note" x="108" y="438">Many compact footfalls keep rhythm steady.</text>
        </g>
      ) : (
        <g className="cadence-diagram is-low">
          <text x="108" y="124">Longer stride pattern</text>
          <path className="low-bpm-line" d="M90 366 C186 334 250 406 350 374 C456 342 520 414 636 384" />
          <g className="low-strides" aria-hidden="true">
            {[120, 288, 500].map((x) => (
              <line key={x} x1={x} x2={x + 96} y1="408" y2="408" />
            ))}
          </g>
          <text className="diagram-note" x="108" y="438">Fewer longer steps can make pace feel heavier.</text>
        </g>
      )}

      {/* Runner silhouette adapted from SVG Repo's CC0 "runner-silhouette" vector. */}
      <g className={`real-runner ${isHigh ? "is-high" : "is-low"}`} aria-hidden="true" transform="translate(238 118) scale(2.08)">
        <path d="M14.058,112.273c-2.671,0-5.174-1.659-6.123-4.319c-1.206-3.381,0.558-7.1,3.939-8.305 c8.797-3.145,18.032-8.08,19.576-10.444c2.219-7.225,9.508-23.93,9.82-24.645c1.437-3.29,5.27-4.792,8.559-3.354 c3.29,1.438,4.791,5.269,3.354,8.559c-2.062,4.719-7.76,18.121-9.35,23.401c-2.609,8.664-18.407,15.452-27.592,18.727 C15.52,112.151,14.783,112.273,14.058,112.273z" />
        <path d="M65.87,121.352c-0.763,0-1.538-0.136-2.294-0.421c-3.358-1.268-5.054-5.018-3.787-8.376 c2.805-7.434,5.827-16.579,6.66-20.561c-2.797-2.67-9.536-8.242-15.298-12.741c-2.83-2.21-3.332-6.294-1.123-9.124 c2.21-2.828,6.295-3.33,9.124-1.122c17.609,13.751,19.027,16.47,19.633,17.63c1.21,2.32,2.716,5.208-6.833,30.508 C70.969,119.747,68.497,121.352,65.87,121.352z" />
        <circle cx="76.713" cy="14.166" r="14.166" />
        <path d="M68.121,26.851c0,0,1.546,0.19,2.986,0.859c1.375,0.64,2.783,1.641,2.783,1.641l0.036,0.024 c3.896,2.979,6.987,8.574,4.649,13.91L66.033,71.93c-2.727,6.223-10.594,7.369-16.32,4.86c-0.975-0.427-1.907-0.958-2.773-1.583 c-4.06-2.921-7.093-8.293-4.722-13.708l12.545-28.645C57.09,27.538,63.32,26.015,68.121,26.851z" />
        <path d="M28.649,50.542c-1.12,0-2.25-0.34-3.225-1.048c-2.458-1.783-3.006-5.22-1.224-7.679 c2.7-3.724,9.596-12.598,15.307-14.555c5.321-1.824,21.093-0.901,25.8-0.575c3.03,0.21,5.316,2.836,5.106,5.867 c-0.209,3.029-2.805,5.313-5.866,5.107c-8.536-0.589-19.204-0.728-21.479,0.009c-1.657,0.663-6.417,5.722-9.963,10.605 C32.029,49.755,30.351,50.542,28.649,50.542z" />
        <path d="M85.548,44.799c-5.263,0-10.754-0.317-13.907-0.536c-3.03-0.21-5.316-2.836-5.106-5.867 c0.209-3.029,2.8-5.319,5.866-5.107c8.536,0.591,19.204,0.728,21.478-0.009c1.666-0.666,6.426-5.725,9.964-10.604 c1.784-2.458,5.222-3.007,7.682-1.224c2.459,1.783,3.007,5.222,1.225,7.681c-2.7,3.724-9.597,12.597-15.308,14.554 C94.971,44.535,90.355,44.799,85.548,44.799z" />
      </g>

      <g className="tempo-tags" aria-hidden="true">
        <rect x="470" y="94" width="150" height="46" rx="23" />
        <text x="545" y="124" textAnchor="middle">{isHigh ? "High BPM" : "Low BPM"}</text>
      </g>
    </svg>
  );
}

function HighBpmPage() {
  const [diagramMode, setDiagramMode] = useState("high");

  return (
    <main className="bpm-lesson-shell">
      <section className="bpm-lesson-hero" aria-labelledby="bpm-lesson-title">
        <div className="lesson-copy">
          <a className="lesson-back-link" href="/">
            Back to converter
          </a>
          <p className="eyebrow">Running cadence guide</p>
          <h1 id="bpm-lesson-title">Why high-BPM music helps running</h1>
          <p className="lesson-lede">
            High-BPM music gives new runners a steady external cue. When the beat is quick and even, it is
            easier to keep lighter steps, reduce overstriding, and stay close to a consistent cadence.
          </p>
          <div className="lesson-actions">
            <a className="primary-action" href="/">
              Start converting music
            </a>
            <a className="secondary-action" href="/#target-bpm-input">
              Set a target BPM
            </a>
          </div>
        </div>

        <div className="lesson-visual">
          <div className="diagram-switch" aria-label="Select BPM cadence diagram">
            <button
              className={diagramMode === "low" ? "is-selected" : ""}
              type="button"
              onClick={() => setDiagramMode("low")}
              aria-pressed={diagramMode === "low"}
            >
              Low BPM diagram
            </button>
            <button
              className={diagramMode === "high" ? "is-selected" : ""}
              type="button"
              onClick={() => setDiagramMode("high")}
              aria-pressed={diagramMode === "high"}
            >
              High BPM diagram
            </button>
          </div>
          <RunnerCadenceSvg mode={diagramMode} />
        </div>
      </section>

      <section className="cadence-comparison" aria-label="High BPM and low BPM comparison">
        <article>
          <span>High BPM: quicker cadence</span>
          <p>
            Faster music can act like a metronome. It nudges the body toward shorter ground contact and a
            smoother rhythm, especially when the target is near 170 to 190 BPM.
          </p>
        </article>
        <article>
          <span>Low BPM: longer, heavier steps</span>
          <p>
            Slower beats often invite longer strides. That can make the run feel heavier and less consistent,
            particularly for beginners still learning pacing.
          </p>
        </article>
      </section>
    </main>
  );
}

function App() {
  const inputRef = useRef(null);
  const [language, setLanguage] = useState(() => getInitialLanguage());
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState(() => createMessage("status.ready"));
  const [error, setError] = useState(null);
  const [tracks, setTracks] = useState([]);
  const tracksRef = useRef([]);
  const [activeTrackId, setActiveTrackId] = useState(null);

  const isLessonPage = isHighBpmRoute(globalThis.location?.pathname);
  const t = useMemo(() => createTranslator(language), [language]);

  useEffect(() => {
    document.documentElement.lang = isLessonPage ? "en" : language;
    document.documentElement.dir = isLessonPage ? "ltr" : getLanguageDirection(language);
    if (!isLessonPage) {
      persistLanguage(language);
    }
  }, [language, isLessonPage]);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  const statusText = renderMessage(status, t);

  const activeTrack = useMemo(
    () => tracks.find((track) => track.localId === activeTrackId) || tracks[0] || null,
    [activeTrackId, tracks]
  );

  const adjustedSource = useMemo(
    () => adjustedSourceBpm(activeTrack?.sourceBpm, activeTrack?.sourceMode),
    [activeTrack]
  );

  const tempoFactor = useMemo(() => {
    if (!adjustedSource || !activeTrack?.targetBpm) return null;
    return activeTrack.targetBpm / adjustedSource;
  }, [adjustedSource, activeTrack]);

  const tempoDelta = useMemo(() => {
    if (!tempoFactor) return null;
    return ((tempoFactor - 1) * 100).toFixed(1);
  }, [tempoFactor]);
  const seoKeywords = useMemo(() => getSeoPage(language).keywords, [language]);

  const largeShift = tempoFactor && (tempoFactor < 0.75 || tempoFactor > 1.35);
  const loadedCount = tracks.filter((track) => track.fileId).length;
  const targetChipBpm = activeTrack?.targetBpm || DEFAULT_TARGET_BPM;
  const errorText = renderMessage(error, t);

  function updateTrack(localId, patch) {
    const nextTracks = tracksRef.current.map((track) =>
      track.localId === localId ? { ...track, ...patch } : track
    );
    tracksRef.current = nextTracks;
    setTracks(nextTracks);
  }

  async function analyzeOneFile(file, localId) {
    const formData = new FormData();
    formData.append("track", file);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "BPM analysis failed.");
      }

      updateTrack(localId, withTrackDefaults(payload));
      return { ok: true };
    } catch (analysisError) {
      const localizedError = createErrorMessage(analysisError.message, "error.bpmAnalysisFailed");
      updateTrack(localId, {
        phase: "error",
        error: localizedError
      });
      return { ok: false, error: localizedError };
    }
  }

  async function analyzeFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    setError(null);

    const accepted = [];
    const rejected = [];

    files.forEach((file) => {
      if (isSupportedAudio(file)) {
        accepted.push(file);
      } else {
        rejected.push(file.name);
      }
    });

    if (rejected.length) {
      setError(
        createMessage(pluralKey("error.skippedUnsupported", rejected.length), {
          files: rejected.join(", ")
        })
      );
    }

    if (!accepted.length) {
      setStatus(createMessage("status.invalidFile"));
      return;
    }

    const newTracks = accepted.map((file, index) => ({
      localId: createClientId(file, index),
      originalName: file.name,
      size: file.size,
      mimeType: file.type || "",
      duration: null,
      detectedBpm: null,
      sourceBpm: "",
      targetBpm: DEFAULT_TARGET_BPM,
      sourceMode: "normal",
      mixMetronome: false,
      metronomeVolume: "medium",
      metronomeSound: "pulse",
      phase: "analyzing",
      result: null,
      error: null
    }));

    setTracks((currentTracks) => {
      const nextTracks = [...currentTracks, ...newTracks];
      tracksRef.current = nextTracks;
      return nextTracks;
    });
    setActiveTrackId(newTracks[0].localId);
    setStatus(createMessage(pluralKey("status.analyzing", newTracks.length), { count: newTracks.length }));

    await Promise.all(newTracks.map((track, index) => analyzeOneFile(accepted[index], track.localId)));
    const newTrackIds = new Set(newTracks.map((track) => track.localId));

    setStatus((currentStatus) => {
      const remainingNewTracks = tracksRef.current.filter((track) => newTrackIds.has(track.localId));

      if (!remainingNewTracks.length) {
        return tracksRef.current.length ? currentStatus : createMessage("status.ready");
      }

      const successCount = remainingNewTracks.filter((track) => canConvertTrack(track)).length;
      return successCount
        ? createMessage(pluralKey("status.tracksReady", successCount), { count: successCount })
        : createMessage("status.analyzeFailed");
    });
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  async function convertTrack(localId) {
    const track = tracks.find((candidate) => candidate.localId === localId);
    if (!canConvertTrack(track)) return;

    try {
      setError(null);
      updateTrack(localId, {
        phase: "converting",
        result: null,
        error: null
      });
      setActiveTrackId(localId);
      setStatus(createMessage("status.stretching"));

      const response = await fetch("/api/convert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fileId: track.fileId,
          sourceBpm: track.sourceBpm,
          targetBpm: track.targetBpm,
          sourceMode: track.sourceMode,
          mixMetronome: Boolean(track.mixMetronome),
          metronomeVolume: track.metronomeVolume || "medium",
          metronomeSound: track.metronomeSound || "pulse"
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Conversion failed.");
      }

      updateTrack(localId, {
        phase: "complete",
        result: payload,
        error: null
      });
      setStatus(createMessage("status.downloadReady"));
    } catch (conversionError) {
      const localizedError = createErrorMessage(conversionError.message, "error.conversionFailed");
      updateTrack(localId, {
        phase: "error",
        error: localizedError
      });
      setStatus(createMessage("status.conversionFailed"));
      setError(localizedError);
    }
  }

  function removeTrack(localId) {
    const remaining = tracks.filter((track) => track.localId !== localId);
    if (remaining.length === tracks.length) return;

    tracksRef.current = remaining;
    setTracks(remaining);
    setActiveTrackId((currentId) => {
      if (currentId !== localId) return currentId;
      return remaining[0]?.localId || null;
    });
    setStatus((currentStatus) => statusAfterTrackRemoval(remaining, currentStatus));
    if (!remaining.length) {
      setError(null);
    }
  }

  function resetTracks() {
    tracksRef.current = [];
    setTracks([]);
    setActiveTrackId(null);
    setError(null);
    setStatus(createMessage("status.ready"));
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function updateActiveTrack(patch) {
    if (!activeTrack) return;
    updateTrack(activeTrack.localId, patch);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    analyzeFiles(event.dataTransfer.files);
  }

  if (isLessonPage) {
    return <HighBpmPage />;
  }

  return (
    <main className="app-shell">
      <section className="console" aria-labelledby="app-title">
        <header className="topbar">
          <div className="brand-block">
            <div className="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <div>
              <p className="eyebrow">{t("brand.eyebrow")}</p>
              <h1 id="app-title">Beats Your Music</h1>
            </div>
          </div>

          <div className="target-chip" aria-label={t("target.aria", { bpm: DEFAULT_TARGET_BPM })}>
            <span>{t("target.label")}</span>
            <strong>{targetChipBpm}</strong>
            <b>BPM</b>
          </div>

          <a className="learn-link" href="/why-high-bpm/">
            Why high BPM?
          </a>

          <label className="language-picker">
            <span>{t("language.label")}</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              {SUPPORTED_LANGUAGES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="process-status" aria-live="polite">
            <span>{t("process.label")}</span>
            <strong>{statusText}</strong>
          </div>
        </header>

        <div className="workspace-grid">
          <section className="panel upload-panel" aria-labelledby="upload-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t("upload.eyebrow")}</p>
                <h2 id="upload-heading">{t("upload.heading")}</h2>
              </div>
              {loadedCount ? (
                <strong className="count-chip">
                  {t(pluralKey("upload.count", loadedCount), { count: loadedCount })}
                </strong>
              ) : null}
            </div>

            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept={ACCEPTED_TYPES}
              multiple
              onChange={(event) => analyzeFiles(event.target.files)}
              tabIndex="-1"
            />

            <button
              className={`dropzone ${dragging ? "is-dragging" : ""}`}
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <span className="upload-glyph" aria-hidden="true" />
              <strong>{tracks.length ? t("upload.drop.add") : t("upload.drop.initial")}</strong>
              <small>{t("upload.drop.help")}</small>
            </button>

            {tracks.length ? (
              <div className="track-list" aria-label={t("upload.trackListAria")}>
                {tracks.map((track) => {
                  const rowActive = activeTrack?.localId === track.localId;
                  return (
                    <article
                      className={`track-strip ${rowActive ? "is-active" : ""}`}
                      key={track.localId}
                    >
                      <button
                        className="track-select"
                        type="button"
                        onClick={() => setActiveTrackId(track.localId)}
                        aria-label={t("track.selectAria", { name: track.originalName })}
                        aria-pressed={rowActive}
                      >
                        <span className="album-tile" aria-hidden="true">
                          <span />
                        </span>
                      </button>
                      <div className="track-meta">
                        <strong>{track.originalName}</strong>
                        <span>
                          {formatDuration(track.duration, t)} | {formatBytes(track.size)} |{" "}
                          {track.mimeType || t("track.audioFile")}
                        </span>
                        {track.error ? <em>{renderMessage(track.error, t)}</em> : null}
                      </div>
                      <div className="track-bpm">
                        <span>{track.phase === "analyzing" ? t("track.analyzing") : t("track.detected")}</span>
                        <strong>{track.detectedBpm ? `${track.detectedBpm} BPM` : "--"}</strong>
                      </div>
                      <button
                        className="row-action"
                        type="button"
                        disabled={!canConvertTrack(track)}
                        onClick={() => convertTrack(track.localId)}
                      >
                        {track.phase === "converting"
                          ? t("track.converting")
                          : t("track.convert", { bpm: track.targetBpm || DEFAULT_TARGET_BPM })}
                      </button>
                      {track.result ? (
                        <a className="row-download" href={track.result.downloadUrl}>
                          {t("track.downloadMp3")}
                        </a>
                      ) : (
                        <button className="row-download" type="button" disabled>
                          {t("track.downloadMp3")}
                        </button>
                      )}
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => removeTrack(track.localId)}
                        aria-label={t("track.removeAria", { name: track.originalName })}
                      >
                        x
                      </button>
                    </article>
                  );
                })}
                <button className="clear-button" type="button" onClick={resetTracks}>
                  {t("track.clearAll")}
                </button>
              </div>
            ) : (
              <div className="empty-copy">
                <strong>{t("upload.emptyTitle")}</strong>
                <span>{t("upload.emptyCopy")}</span>
              </div>
            )}
          </section>

          <section className="panel conversion-panel" aria-labelledby="conversion-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t("conversion.eyebrow")}</p>
                <h2 id="conversion-heading">{t("conversion.heading")}</h2>
              </div>
              {activeTrack ? <strong className="active-file">{activeTrack.originalName}</strong> : null}
            </div>

            <div className="bpm-readout" aria-label={t("conversion.readoutAria")}>
              <div>
                <span>{t("conversion.sourceBpm")}</span>
                <strong>{activeTrack?.sourceBpm || "--"}</strong>
                <small>{t("conversion.correction", { mode: sourceModeLabel(activeTrack?.sourceMode) })}</small>
              </div>
              <div className="arrow" aria-hidden="true" />
              <div>
                <span>{t("conversion.targetBpm")}</span>
                <strong className="accent">{activeTrack?.targetBpm || "--"}</strong>
                <small>{t("conversion.defaultTarget")}</small>
              </div>
            </div>

            <div className="form-grid">
              <label className="field">
                <span>{t("conversion.sourceBpm")}</span>
                <input
                  type="number"
                  min="40"
                  max="260"
                  step="0.1"
                  value={activeTrack?.sourceBpm || ""}
                  onChange={(event) => updateActiveTrack({ sourceBpm: clampBpm(event.target.value) })}
                  placeholder={t("conversion.sourcePlaceholder")}
                  disabled={!activeTrack}
                />
              </label>

              <div className="field target-bpm-field">
                <label htmlFor="target-bpm-input">{t("conversion.targetBpm")}</label>
                <div className="bpm-stepper">
                  <button
                    className="stepper-button"
                    type="button"
                    onClick={() => updateActiveTrack({ targetBpm: stepTargetBpm(activeTrack?.targetBpm, -1) })}
                    disabled={!activeTrack}
                    aria-label={t("conversion.targetDecrease")}
                  >
                    -
                  </button>
                  <input
                    id="target-bpm-input"
                    type="number"
                    min="40"
                    max="260"
                    step="1"
                    value={activeTrack ? activeTrack.targetBpm : DEFAULT_TARGET_BPM}
                    onChange={(event) => updateActiveTrack({ targetBpm: clampBpm(event.target.value) })}
                    disabled={!activeTrack}
                    aria-describedby="target-bpm-help"
                  />
                  <button
                    className="stepper-button"
                    type="button"
                    onClick={() => updateActiveTrack({ targetBpm: stepTargetBpm(activeTrack?.targetBpm, 1) })}
                    disabled={!activeTrack}
                    aria-label={t("conversion.targetIncrease")}
                  >
                    +
                  </button>
                </div>
                <small id="target-bpm-help" className="field-hint">
                  {t("conversion.targetHint")}
                </small>
              </div>
            </div>

            <fieldset className="segmented" disabled={!activeTrack}>
              <legend>{t("conversion.tempoCorrection")}</legend>
              {[
                ["half", t("sourceMode.half")],
                ["normal", t("sourceMode.normal")],
                ["double", t("sourceMode.double")]
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  className={activeTrack?.sourceMode === mode ? "is-selected" : ""}
                  type="button"
                  onClick={() => updateActiveTrack({ sourceMode: mode })}
                  aria-pressed={activeTrack?.sourceMode === mode}
                >
                  {label}
                </button>
              ))}
            </fieldset>

            <div className="pitch-note pitch-static">
              <span className="pitch-badge" aria-hidden="true">P</span>
              <div>
                <strong>{t("pitch.heading")}</strong>
                <span>{t("pitch.body")}</span>
              </div>
            </div>

            <label className={`metronome-option ${activeTrack?.mixMetronome ? "is-enabled" : ""}`}>
              <input
                type="checkbox"
                checked={Boolean(activeTrack?.mixMetronome)}
                disabled={!activeTrack}
                onChange={(event) => updateActiveTrack({ mixMetronome: event.target.checked })}
              />
              <span className="metronome-switch" aria-hidden="true">
                <b />
              </span>
              <span className="metronome-copy">
                <strong>{t("conversion.metronomeToggle")}</strong>
                <small>{t("conversion.metronomeHint")}</small>
              </span>
            </label>

            <fieldset className="metronome-sound" disabled={!activeTrack || !activeTrack.mixMetronome}>
              <legend>{t("conversion.metronomeSound")}</legend>
              {METRONOME_SOUND_TYPES.map((sound) => (
                <button
                  key={sound}
                  className={(activeTrack?.metronomeSound || "pulse") === sound ? "is-selected" : ""}
                  type="button"
                  onClick={() => updateActiveTrack({ metronomeSound: sound })}
                  aria-pressed={(activeTrack?.metronomeSound || "pulse") === sound}
                >
                  {t(`metronomeSound.${sound}`)}
                </button>
              ))}
            </fieldset>

            <fieldset className="metronome-volume" disabled={!activeTrack || !activeTrack.mixMetronome}>
              <legend>{t("conversion.metronomeVolume")}</legend>
              {METRONOME_VOLUME_LEVELS.map((level) => (
                <button
                  key={level}
                  className={(activeTrack?.metronomeVolume || "medium") === level ? "is-selected" : ""}
                  type="button"
                  onClick={() => updateActiveTrack({ metronomeVolume: level })}
                  aria-pressed={(activeTrack?.metronomeVolume || "medium") === level}
                >
                  {t(`metronomeVolume.${level}`)}
                </button>
              ))}
            </fieldset>
          </section>
        </div>

        <section className="tempo-lane panel" aria-labelledby="lane-heading">
          <div className="lane-heading">
            <div>
              <p className="eyebrow">{t("lane.eyebrow")}</p>
              <h2 id="lane-heading">
                {adjustedSource ? `${adjustedSource.toFixed(1)} BPM` : t("lane.source")} {t("lane.to")}{" "}
                {activeTrack?.targetBpm || DEFAULT_TARGET_BPM} BPM
              </h2>
            </div>
            {tempoDelta ? (
              <div className={largeShift ? "delta warn" : "delta"}>
                <span>{Number(tempoDelta) >= 0 ? t("lane.faster") : t("lane.slower")}</span>
                <strong>{Math.abs(Number(tempoDelta)).toFixed(1)}%</strong>
              </div>
            ) : null}
          </div>

          <div className="beat-rail" aria-hidden="true">
            {Array.from({ length: 36 }, (_, index) => (
              <span
                key={index}
                style={{
                  "--delay": `${index * 36}ms`,
                  "--height": `${index % 5 === 0 ? 34 : index % 3 === 0 ? 24 : 13}px`,
                  "--opacity": `${0.4 + (index % 4) * 0.14}`
                }}
              />
            ))}
          </div>

          {largeShift ? (
            <p className="warning" role="status">
              {t("lane.warning")}
            </p>
          ) : (
            <p className="lane-copy">
              {t("lane.copy")}
            </p>
          )}
        </section>

        <section className="output-bar" aria-labelledby="output-heading">
          <div>
            <p className="eyebrow">{t("output.eyebrow")}</p>
            <h2 id="output-heading">
              {activeTrack?.result ? t("output.converted") : t("output.ready")}
            </h2>
            {activeTrack?.result?.alignment ? (
              <p className="alignment-summary">
                <strong>{t("output.alignmentTitle")}</strong>
                <span>
                  {t("output.alignmentDetail", {
                    bpm: activeTrack.result.alignment.targetBpm || activeTrack.result.targetBpm
                  })}
                </span>
              </p>
            ) : null}
            {activeTrack?.result?.metronomeMixed ? (
              <p className="metronome-summary">
                <strong>{t("output.metronomeMixed")}</strong>
                <span>
                  {t("output.metronomeMixedDetail", {
                    level: t(`metronomeVolume.${activeTrack.result.metronomeVolume || "medium"}`),
                    sound: t(`metronomeSound.${activeTrack.result.metronomeSound || "pulse"}`)
                  })}
                </span>
              </p>
            ) : null}
          </div>
          <dl>
            <div>
              <dt>{t("output.format")}</dt>
              <dd>MP3</dd>
            </div>
            <div>
              <dt>{t("output.newBpm")}</dt>
              <dd>{activeTrack?.result?.targetBpm || activeTrack?.targetBpm || DEFAULT_TARGET_BPM}</dd>
            </div>
            <div>
              <dt>{t("output.tempoScale")}</dt>
              <dd>{tempoFactor ? `${tempoFactor.toFixed(3)}x` : "--"}</dd>
            </div>
          </dl>
          <p className="conversion-guidance" aria-live="polite">
            {t("output.guidance")}
          </p>

          <div className="actions">
            <button
              className="primary-action"
              type="button"
              disabled={!canConvertTrack(activeTrack)}
              onClick={() => convertTrack(activeTrack.localId)}
            >
              {activeTrack?.phase === "converting"
                ? t("output.convertingAudio")
                : t("output.convertSelected", { bpm: activeTrack?.targetBpm || DEFAULT_TARGET_BPM })}
            </button>
            {activeTrack?.result ? (
              <a className="secondary-action" href={activeTrack.result.downloadUrl}>
                {t("output.download")}
              </a>
            ) : (
              <button className="secondary-action" type="button" disabled>
                {t("output.download")}
              </button>
            )}
          </div>
        </section>

        {activeTrack?.result ? (
          <section className="preview-panel" aria-label={t("output.previewAria")}>
            <audio controls src={activeTrack.result.downloadUrl} />
          </section>
        ) : null}

        {errorText ? (
          <div className="error-banner" role="alert">
            <strong>{t("error.attention")}</strong>
            <span>{errorText}</span>
          </div>
        ) : null}

        <section className="seo-summary" aria-labelledby="seo-heading">
          <div className="seo-copy">
            <p className="eyebrow">{t("seo.eyebrow")}</p>
            <h2 id="seo-heading">{t("seo.heading")}</h2>
            <p>{t("seo.body")}</p>
          </div>
          <ul className="seo-points">
            <li>{t("seo.point.batch")}</li>
            <li>{t("seo.point.running")}</li>
            <li>{t("seo.point.metronome")}</li>
          </ul>
          <div className="seo-tags" aria-label={t("seo.keywordsLabel")}>
            {seoKeywords.map((keyword) => (
              <span key={keyword}>{keyword}</span>
            ))}
          </div>
        </section>

        <p className="retention-footnote">
          {t("retention.footnote")}
        </p>
      </section>
    </main>
  );
}

export default App;
