import { describe, expect, it } from "vitest";
import {
  adjustBpmForMode,
  buildAtempoChain,
  buildMetronomeClickSource,
  buildMetronomeGrid,
  buildTempoConversionArgs,
  buildTempoAlignmentPlan,
  buildTempoAlignmentFilter,
  calculateTempoFactor,
  chooseDetectedTempo,
  createMusicTempoOptions,
  extractBpmFromFileName,
  getMetronomeMixWeight,
  chooseAnalysisWindow,
  isValidBpm,
  normalizeMetronomeVolume,
  normalizeBpm
} from "../server/audio-utils.js";

describe("audio utilities", () => {
  it("validates runner-friendly BPM bounds", () => {
    expect(isValidBpm(180)).toBe(true);
    expect(isValidBpm(39.9)).toBe(false);
    expect(isValidBpm(260.1)).toBe(false);
    expect(isValidBpm("fast")).toBe(false);
  });

  it("normalizes BPM to one decimal place", () => {
    expect(normalizeBpm(179.96)).toBe(180);
    expect(() => normalizeBpm(12)).toThrow("BPM must be between");
  });

  it("calculates target/source tempo factor", () => {
    expect(calculateTempoFactor(150, 180)).toBe(1.2);
    expect(calculateTempoFactor(180, 90)).toBe(0.5);
  });

  it("configures tempo detection for the full supported BPM range", () => {
    expect(createMusicTempoOptions()).toEqual({
      maxBeatInterval: 1.5,
      minBeatInterval: 0.2308
    });
  });

  it("adjusts source BPM for half-time and double-time detections", () => {
    expect(adjustBpmForMode(90, "double")).toBe(180);
    expect(adjustBpmForMode(180, "half")).toBe(90);
    expect(adjustBpmForMode(172, "normal")).toBe(172);
  });

  it("chains FFmpeg atempo filters outside the simple range", () => {
    expect(buildAtempoChain(1.25)).toBe("atempo=1.25");
    expect(buildAtempoChain(4)).toBe("atempo=2,atempo=2");
    expect(buildAtempoChain(0.25)).toBe("atempo=0.5,atempo=0.5");
  });

  it("chooses a bounded analysis window for long songs", () => {
    expect(chooseAnalysisWindow(45)).toEqual({ startAt: 0, analyzeSeconds: 90 });
    expect(chooseAnalysisWindow(240)).toEqual({ startAt: 75, analyzeSeconds: 90 });
  });

  it("keeps all atempo chain segments in the quality range", () => {
    const parts = buildAtempoChain(7)
      .split(",")
      .map((part) => Number(part.replace("atempo=", "")));

    expect(parts.every((part) => part >= 0.5 && part <= 2)).toBe(true);
  });

  it("sets up a target metronome grid for the requested BPM", () => {
    expect(buildMetronomeGrid(180, 1.1)).toEqual([0, 0.333, 0.667, 1]);
    expect(buildMetronomeGrid(120, 2.1)).toEqual([0, 0.5, 1, 1.5, 2]);
  });

  it("extracts BPM from app-converted download file names", () => {
    expect(extractBpmFromFileName("my-track-180bpm.mp3")).toBe(180);
    expect(extractBpmFromFileName("long run mix_172.5 BPM.wav")).toBe(172.5);
    expect(extractBpmFromFileName("plain-track.mp3")).toBeNull();
    expect(extractBpmFromFileName("bad-320bpm.mp3")).toBeNull();
  });

  it("uses explicit converted-file BPM instead of a wrong detector harmonic", () => {
    const result = chooseDetectedTempo({
      originalName: "song-180bpm.mp3",
      musicTempoBpm: 103.8,
      musicTempoBeats: [0.44, 1.02, 1.6],
      durationSeconds: 1.1
    });

    expect(result.detectedBpm).toBe(180);
    expect(result.detectionSource).toBe("filename");
    expect(result.detectedBeats).toEqual([0, 0.333, 0.667, 1]);
  });

  it("uses explicit BPM metadata before analyzing the audio content", () => {
    const result = chooseDetectedTempo({
      originalName: "renamed.mp3",
      metadata: { TBPM: "180" },
      musicTempoBpm: 103.8,
      musicTempoBeats: [0.44, 1.02, 1.6],
      durationSeconds: 1.1
    });

    expect(result.detectedBpm).toBe(180);
    expect(result.detectionSource).toBe("metadata");
    expect(result.detectedBeats).toEqual([0, 0.333, 0.667, 1]);
  });

  it("falls back to the analyzed tempo when the file has no explicit BPM", () => {
    const result = chooseDetectedTempo({
      originalName: "song.mp3",
      musicTempoBpm: 103.83,
      musicTempoBeats: [0.44, 1.02],
      durationSeconds: 4
    });

    expect(result.detectedBpm).toBe(103.8);
    expect(result.detectionSource).toBe("analysis");
    expect(result.detectedBeats).toEqual([0.44, 1.02]);
  });

  it("plans tempo stretch and first-beat alignment to the metronome", () => {
    const plan = buildTempoAlignmentPlan({
      sourceBpm: 120,
      targetBpm: 180,
      sourceBeats: [0.24, 0.74, 1.24],
      durationSeconds: 8
    });

    expect(plan.tempoFactor).toBe(1.5);
    expect(plan.sourceBpm).toBe(120);
    expect(plan.targetBpm).toBe(180);
    expect(plan.sourceFirstBeatSeconds).toBe(0.24);
    expect(plan.stretchedFirstBeatSeconds).toBe(0.16);
    expect(plan.metronomeFirstBeatSeconds).toBe(0);
    expect(plan.trimAfterTempoSeconds).toBe(0.16);
    expect(plan.metronomeGridSeconds.slice(0, 3)).toEqual([0, 0.333, 0.667]);
  });

  it("builds an FFmpeg filter that stretches then aligns audio to the metronome", () => {
    const filter = buildTempoAlignmentFilter({
      sourceBpm: 120,
      targetBpm: 180,
      sourceBeats: [0.24, 0.74, 1.24],
      durationSeconds: 8
    });

    expect(filter).toBe("atempo=1.5,atrim=start=0.16,asetpts=PTS-STARTPTS");
  });

  it("builds a target-BPM click source for a background metronome", () => {
    const source = buildMetronomeClickSource(180, 8);

    expect(source).toContain("aevalsrc=exprs=");
    expect(source).toContain("mod(t\\,0.333");
    expect(source).toContain("s=44100");
    expect(source).toContain("d=8");
  });

  it("normalizes the three metronome volume ranges", () => {
    expect(normalizeMetronomeVolume("low")).toBe("low");
    expect(normalizeMetronomeVolume("medium")).toBe("medium");
    expect(normalizeMetronomeVolume("high")).toBe("high");
    expect(normalizeMetronomeVolume("invalid")).toBe("medium");
    expect(getMetronomeMixWeight("low")).toBe(0.1);
    expect(getMetronomeMixWeight("medium")).toBe(0.18);
    expect(getMetronomeMixWeight("high")).toBe(0.3);
  });

  it("adds a lavfi click input and mixes it when metronome output is enabled", () => {
    const args = buildTempoConversionArgs("input.wav", "output.mp3", {
      sourceBpm: 120,
      targetBpm: 180,
      sourceBeats: [0.24, 0.74, 1.24],
      durationSeconds: 8,
      mixMetronome: true,
      metronomeVolume: "high"
    });
    const joined = args.join(" ");

    expect(args).toContain("-f");
    expect(args).toContain("lavfi");
    expect(args).toContain("-filter_complex");
    expect(joined).toContain("[0:a]atempo=1.5");
    expect(joined).toContain("amix=inputs=2");
    expect(joined).toContain("weights=1 0.3");
    expect(joined).toContain("duration=first");
    expect(joined).toContain("-map [out]");
  });

  it("keeps the simple audio filter path when metronome output is disabled", () => {
    const args = buildTempoConversionArgs("input.wav", "output.mp3", {
      sourceBpm: 120,
      targetBpm: 180,
      sourceBeats: [0.24, 0.74, 1.24],
      durationSeconds: 8,
      mixMetronome: false
    });

    expect(args).toContain("-filter:a");
    expect(args).not.toContain("-filter_complex");
    expect(args).not.toContain("lavfi");
  });

  it("writes target BPM metadata to converted MP3 output", () => {
    const args = buildTempoConversionArgs("input.wav", "output.mp3", {
      sourceBpm: 120,
      targetBpm: 180,
      sourceBeats: [0.24, 0.74, 1.24],
      durationSeconds: 8
    });

    expect(args).toContain("-metadata");
    expect(args).toContain("TBPM=180");
    expect(args).toContain("BPM=180");
  });
});
