import { useMemo, useRef, useState } from "react";

const DEFAULT_TARGET_BPM = 180;
const TARGET_PRESETS = [160, 170, 180, 190];
const ACCEPTED_TYPES = "audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.aiff,.aif";

function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "Unknown length";
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
    error: ""
  };
}

function canConvertTrack(track) {
  if (!track || track.phase === "analyzing" || track.phase === "converting" || !track.fileId) {
    return false;
  }

  const adjustedSource = adjustedSourceBpm(track.sourceBpm, track.sourceMode);
  return adjustedSource >= 40 && adjustedSource <= 260 && track.targetBpm >= 40 && track.targetBpm <= 260;
}

function App() {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [statusText, setStatusText] = useState("Ready");
  const [error, setError] = useState("");
  const [tracks, setTracks] = useState([]);
  const [activeTrackId, setActiveTrackId] = useState(null);

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
      updateTrack(localId, {
        phase: "error",
        error: analysisError.message
      });
      return { ok: false, error: analysisError.message };
    }
  }

  async function analyzeFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    setError("");

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
      setError(`Skipped unsupported file${rejected.length === 1 ? "" : "s"}: ${rejected.join(", ")}.`);
    }

    if (!accepted.length) {
      setStatusText("Invalid file");
      return;
    }

    const newTracks = accepted.map((file, index) => ({
      localId: createClientId(file, index),
      originalName: file.name,
      size: file.size,
      mimeType: file.type || "Audio file",
      duration: null,
      detectedBpm: null,
      sourceBpm: "",
      targetBpm: DEFAULT_TARGET_BPM,
      sourceMode: "normal",
      phase: "analyzing",
      result: null,
      error: ""
    }));

    setTracks((currentTracks) => [...currentTracks, ...newTracks]);
    setActiveTrackId(newTracks[0].localId);
    setStatusText(`Analyzing ${newTracks.length} track${newTracks.length === 1 ? "" : "s"}`);

    const results = await Promise.all(
      newTracks.map((track, index) => analyzeOneFile(accepted[index], track.localId))
    );
    const successCount = results.filter((result) => result.ok).length;

    setStatusText(
      successCount
        ? `${successCount} track${successCount === 1 ? "" : "s"} ready to convert`
        : "Analyze failed"
    );
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  async function convertTrack(localId) {
    const track = tracks.find((candidate) => candidate.localId === localId);
    if (!canConvertTrack(track)) return;

    try {
      setError("");
      updateTrack(localId, {
        phase: "converting",
        result: null,
        error: ""
      });
      setActiveTrackId(localId);
      setStatusText("Stretching audio. Large files can take a minute.");

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
        error: ""
      });
      setStatusText("Download ready");
    } catch (conversionError) {
      updateTrack(localId, {
        phase: "error",
        error: conversionError.message
      });
      setStatusText("Conversion failed");
      setError(conversionError.message);
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
    setError("");
    setStatusText("Ready");
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
              <p className="eyebrow">Local tempo workstation</p>
              <h1 id="app-title">Beats Your Music</h1>
            </div>
          </div>

          <div className="target-chip" aria-label={`Default target BPM is ${DEFAULT_TARGET_BPM}`}>
            <span>Target</span>
            <strong>{targetChipBpm}</strong>
            <b>BPM</b>
          </div>

          <div className="process-status" aria-live="polite">
            <span>Process status</span>
            <strong>{statusText}</strong>
          </div>
        </header>

        <div className="workspace-grid">
          <section className="panel upload-panel" aria-labelledby="upload-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Input</p>
                <h2 id="upload-heading">Upload tracks</h2>
              </div>
              {loadedCount ? <strong className="count-chip">{loadedCount} tracks loaded</strong> : null}
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
              <strong>{tracks.length ? "Add more audio files" : "Drag and drop audio files"}</strong>
              <small>MP3, WAV, FLAC, M4A, OGG, AAC supported up to 80 MB each.</small>
            </button>

            {tracks.length ? (
              <div className="track-list" aria-label="Uploaded audio files">
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
                        aria-label={`Select ${track.originalName}`}
                        aria-pressed={rowActive}
                      >
                        <span className="album-tile" aria-hidden="true">
                          <span />
                        </span>
                      </button>
                      <div className="track-meta">
                        <strong>{track.originalName}</strong>
                        <span>
                          {formatDuration(track.duration)} | {formatBytes(track.size)} |{" "}
                          {track.mimeType || "Audio"}
                        </span>
                        {track.error ? <em>{track.error}</em> : null}
                      </div>
                      <div className="track-bpm">
                        <span>{track.phase === "analyzing" ? "Analyzing" : "Detected"}</span>
                        <strong>{track.detectedBpm ? `${track.detectedBpm} BPM` : "--"}</strong>
                      </div>
                      <button
                        className="row-action"
                        type="button"
                        disabled={!canConvertTrack(track)}
                        onClick={() => convertTrack(track.localId)}
                      >
                        {track.phase === "converting"
                          ? "Converting"
                          : `Convert to ${track.targetBpm || DEFAULT_TARGET_BPM} BPM`}
                      </button>
                      {track.result ? (
                        <a className="row-download" href={track.result.downloadUrl}>
                          Download MP3
                        </a>
                      ) : (
                        <button className="row-download" type="button" disabled>
                          Download MP3
                        </button>
                      )}
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => removeTrack(track.localId)}
                        aria-label={`Remove ${track.originalName}`}
                      >
                        x
                      </button>
                    </article>
                  );
                })}
                <button className="clear-button" type="button" onClick={resetTracks}>
                  Clear all tracks
                </button>
              </div>
            ) : (
              <div className="empty-copy">
                <strong>Start with one track or a batch.</strong>
                <span>Each audio file gets its own BPM detection, conversion button, preview, and download.</span>
              </div>
            )}
          </section>

          <section className="panel conversion-panel" aria-labelledby="conversion-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Tempo conversion</p>
                <h2 id="conversion-heading">Set the pace</h2>
              </div>
              {activeTrack ? <strong className="active-file">{activeTrack.originalName}</strong> : null}
            </div>

            <div className="bpm-readout" aria-label="Detected BPM to target BPM">
              <div>
                <span>Source BPM</span>
                <strong>{activeTrack?.sourceBpm || "--"}</strong>
                <small>{sourceModeLabel(activeTrack?.sourceMode)} correction</small>
              </div>
              <div className="arrow" aria-hidden="true" />
              <div>
                <span>Target BPM</span>
                <strong className="accent">{activeTrack?.targetBpm || "--"}</strong>
                <small>Default runner target</small>
              </div>
            </div>

            <div className="form-grid">
              <label className="field">
                <span>Source BPM</span>
                <input
                  type="number"
                  min="40"
                  max="260"
                  step="0.1"
                  value={activeTrack?.sourceBpm || ""}
                  onChange={(event) => updateActiveTrack({ sourceBpm: clampBpm(event.target.value) })}
                  placeholder="Detected BPM"
                  disabled={!activeTrack}
                />
              </label>

              <label className="field">
                <span>Target BPM</span>
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
              <legend>Presets</legend>
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
              <legend>Tempo correction</legend>
              {[
                ["half", "Use 1/2 detected BPM"],
                ["normal", "Use detected"],
                ["double", "Use 2x detected BPM"]
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
                <strong>Pitch preserved</strong>
                <span>FFmpeg tempo stretching keeps the original key while changing speed.</span>
              </div>
            </div>
          </section>
        </div>

        <section className="tempo-lane panel" aria-labelledby="lane-heading">
          <div className="lane-heading">
            <div>
              <p className="eyebrow">Tempo lane</p>
              <h2 id="lane-heading">
                {adjustedSource ? `${adjustedSource.toFixed(1)} BPM` : "Source"} to{" "}
                {activeTrack?.targetBpm || DEFAULT_TARGET_BPM} BPM
              </h2>
            </div>
            {tempoDelta ? (
              <div className={largeShift ? "delta warn" : "delta"}>
                <span>{Number(tempoDelta) >= 0 ? "Faster" : "Slower"}</span>
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
              Large tempo shift. The output will still convert, but extreme changes can make music sound less natural.
            </p>
          ) : (
            <p className="lane-copy">
              Optimal running playlists often aim near 180 BPM. Select any row to tune source BPM before converting.
            </p>
          )}
        </section>

        <section className="output-bar" aria-labelledby="output-heading">
          <div>
            <p className="eyebrow">Output preview</p>
            <h2 id="output-heading">
              {activeTrack?.result ? "Converted MP3 ready" : "Ready when analysis completes"}
            </h2>
            {activeTrack?.result?.alignment ? (
              <p className="alignment-summary">
                <strong>Metronome aligned</strong>
                <span>
                  First beat matched to {activeTrack.result.alignment.targetBpm || activeTrack.result.targetBpm} BPM grid
                </span>
              </p>
            ) : null}
          </div>
          <dl>
            <div>
              <dt>Format</dt>
              <dd>MP3</dd>
            </div>
            <div>
              <dt>New BPM</dt>
              <dd>{activeTrack?.result?.targetBpm || activeTrack?.targetBpm || DEFAULT_TARGET_BPM}</dd>
            </div>
            <div>
              <dt>Tempo scale</dt>
              <dd>{tempoFactor ? `${tempoFactor.toFixed(3)}x` : "--"}</dd>
            </div>
          </dl>
          <p className="conversion-guidance" aria-live="polite">
            Conversions usually finish quickly. Larger batches can take a few minutes.
          </p>

          <div className="actions">
            <button
              className="primary-action"
              type="button"
              disabled={!canConvertTrack(activeTrack)}
              onClick={() => convertTrack(activeTrack.localId)}
            >
              {activeTrack?.phase === "converting"
                ? "Converting audio"
                : `Convert selected to ${activeTrack?.targetBpm || DEFAULT_TARGET_BPM} BPM`}
            </button>
            {activeTrack?.result ? (
              <a className="secondary-action" href={activeTrack.result.downloadUrl}>
                Download
              </a>
            ) : (
              <button className="secondary-action" type="button" disabled>
                Download
              </button>
            )}
          </div>
        </section>

        {activeTrack?.result ? (
          <section className="preview-panel" aria-label="Converted audio preview">
            <audio controls src={activeTrack.result.downloadUrl} />
          </section>
        ) : null}

        {error ? (
          <div className="error-banner" role="alert">
            <strong>Needs attention</strong>
            <span>{error}</span>
          </div>
        ) : null}
        <p className="retention-footnote">
          Uploaded and converted files are stored temporarily for processing and automatically removed after about 1 hour.
        </p>
      </section>
    </main>
  );
}

export default App;
