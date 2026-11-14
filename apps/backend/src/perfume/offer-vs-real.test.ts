import { describe, expect, it } from "vitest";
import { offerVsReal, tieredCushionCents, DEFAULT_RULES } from "./desk.service";

describe("Wholesale — my offer vs competitor real price (owner 2026-11-14)", () => {
  it("real price = list − tiered cushion: 20.50 − .50 = 20.00", () => {
    const tiers = DEFAULT_RULES.competitor_cushion_tiers;
    expect(tieredCushionCents(2050, tiers)).toBe(50);
    expect(tieredCushionCents(950, tiers)).toBe(25);
    expect(tieredCushionCents(3200, tiers)).toBe(100);
  });
  it("over by .50 → % of their real price, and the % to reduce my price", () => {
    expect(offerVsReal(2050, 2000)).toEqual({ diffCents: 50, diffPct: 2.5, action: "Over by $0.50 (2.5%) — reduce 2.4%" });
  });
  it("under → room to raise; equal → same", () => {
    expect(offerVsReal(1900, 2000)).toEqual({ diffCents: -100, diffPct: -5, action: "Under by $1.00 (5.0%) — room to raise 5.3%" });
    expect(offerVsReal(2000, 2000).action).toBe("Same as their real price");
  });
});
