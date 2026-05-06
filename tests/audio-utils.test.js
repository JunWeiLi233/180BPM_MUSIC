import { describe, expect, it } from "vitest";
import {
  adjustBpmForMode,
  buildAtempoChain,
  calculateTempoFactor,
  chooseAnalysisWindow,
  isValidBpm,
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
});
