import { describe, expect, it } from "vitest";
import { isMilesColumnInverted, isReverseLaneShortDiffUntrustworthy, milesUntrustworthyFlags } from "../miles-invert";

// MILES-SHORTEST-HOLDS-ALWAYSTRACK-BLEND (owner order 2026-09-04). Load 13508 real values:
// miles_practical=1319.7 (correct, loaded practical route), miles_shortest=1478.1 (the
// AlwaysTrack blend -- loaded-shortest + deadhead -- typed in by an operator, per the law never
// meant to be stored as one number). This is the exact case that must flag.
describe("miles-invert — MILES-INVERT-01 / MILES-SHORTEST-HOLDS-ALWAYSTRACK-BLEND", () => {
  it("flags column inversion when shortest > practical (the load-13508 shape)", () => {
    expect(isMilesColumnInverted(1319.7, 1478.1)).toBe(true);
  });

  it("does not flag when shortest <= practical", () => {
    expect(isMilesColumnInverted(1319.7, 1300)).toBe(false);
    expect(isMilesColumnInverted(1319.7, 1319.7)).toBe(false);
  });

  it("does not flag on zero/blank values (nothing to compare)", () => {
    expect(isMilesColumnInverted(0, 0)).toBe(false);
    expect(isMilesColumnInverted(1319.7, 0)).toBe(false);
  });

  it("recognizes the reverse-lane->100mi trigger reason, matching the DB trigger's own literal", () => {
    expect(isReverseLaneShortDiffUntrustworthy("reverse_lane_short_differs_over_100mi")).toBe(true);
    expect(isReverseLaneShortDiffUntrustworthy("short_exceeds_practical+reverse_lane_short_differs_over_100mi")).toBe(true);
    expect(isReverseLaneShortDiffUntrustworthy("short_exceeds_practical")).toBe(false);
    expect(isReverseLaneShortDiffUntrustworthy(null)).toBe(false);
    expect(isReverseLaneShortDiffUntrustworthy(undefined)).toBe(false);
  });

  it("milesUntrustworthyFlags: load 13508's real shape flags as inverted, any=true", () => {
    const flags = milesUntrustworthyFlags({ practical: 1319.7, shortest: 1478.1 });
    expect(flags.columnInverted).toBe(true);
    expect(flags.any).toBe(true);
  });

  it("milesUntrustworthyFlags: trusts the catalog's own DB-computed flag even when the live numbers alone would not trip", () => {
    const flags = milesUntrustworthyFlags({
      practical: 1000,
      shortest: 900,
      shortMilesUntrustworthy: true,
      shortMilesUntrustworthyReason: "reverse_lane_short_differs_over_100mi",
    });
    expect(flags.reverseLaneShortDiff).toBe(true);
    expect(flags.any).toBe(true);
  });

  it("milesUntrustworthyFlags: a clean, trustworthy lane flags nothing", () => {
    const flags = milesUntrustworthyFlags({ practical: 1319.7, shortest: 1300, shortMilesUntrustworthy: false, shortMilesUntrustworthyReason: null });
    expect(flags.any).toBe(false);
  });
});
