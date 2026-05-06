import { useEffect, useMemo, useRef, useState } from "react";
import {
  SUPPORTED_LANGUAGES,
  createTranslator,
  getInitialLanguage,
  getLanguageDirection
} from "./i18n.js";

const DEFAULT_TARGET_BPM = 180;
const TARGET_PRESETS = [160, 170, 180, 190];
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

function App() {
  const inputRef = useRef(null);
  const [language, setLanguage] = useState(() => getInitialLanguage());
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState(() => createMessage("status.ready"));
  const [error, setError] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [activeTrackId, setActiveTrackId] = useState(null);

  const t = useMemo(() => createTranslator(language), [language]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = getLanguageDirection(language);
    persistLanguage(language);
  }, [language]);

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

  const largeShift = tempoFactor && (tempoFactor < 0.75 || tempoFactor > 1.35);
  const loadedCount = tracks.filter((track) => track.fileId).length;
  const targetChipBpm = activeTrack?.targetBpm || DEFAULT_TARGET_BPM;
  const errorText = renderMessage(error, t);

  function updateTrack(localId, patch) {
    setTracks((currentTracks) =>
      currentTracks.map((track) => (track.localId === localId ? { ...track, ...patch } : track))
    );
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
      phase: "analyzing",
      result: null,
      error: null
    }));

    setTracks((currentTracks) => [...currentTracks, ...newTracks]);
    setActiveTrackId(newTracks[0].localId);
    setStatus(createMessage(pluralKey("status.analyzing", newTracks.length), { count: newTracks.length }));

    const results = await Promise.all(
      newTracks.map((track, index) => analyzeOneFile(accepted[index], track.localId))
    );
    const successCount = results.filter((result) => result.ok).length;

    setStatus(
      successCount
        ? createMessage(pluralKey("status.tracksReady", successCount), { count: successCount })
        : createMessage("status.analyzeFailed")
    );
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
          sourceMode: track.sourceMode
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
    setTracks((currentTracks) => currentTracks.filter((track) => track.localId !== localId));
    setActiveTrackId((currentId) => {
      if (currentId !== localId) return currentId;
      const remaining = tracks.filter((track) => track.localId !== localId);
      return remaining[0]?.localId || null;
    });
  }

  function resetTracks() {
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

              <label className="field">
                <span>{t("conversion.targetBpm")}</span>
                <input
                  type="number"
                  min="40"
                  max="260"
                  step="1"
                  value={activeTrack?.targetBpm || DEFAULT_TARGET_BPM}
                  onChange={(event) => updateActiveTrack({ targetBpm: clampBpm(event.target.value) })}
                  disabled={!activeTrack}
                />
              </label>
            </div>

            <fieldset className="preset-row" disabled={!activeTrack}>
              <legend>{t("conversion.presets")}</legend>
              {TARGET_PRESETS.map((preset) => (
                <button
                  key={preset}
                  className={Number(activeTrack?.targetBpm) === preset ? "is-selected" : ""}
                  type="button"
                  onClick={() => updateActiveTrack({ targetBpm: preset })}
                  aria-pressed={Number(activeTrack?.targetBpm) === preset}
                >
                  {preset}
                </button>
              ))}
            </fieldset>

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
        <p className="retention-footnote">
          {t("retention.footnote")}
        </p>
      </section>
    </main>
  );
}

export default App;
