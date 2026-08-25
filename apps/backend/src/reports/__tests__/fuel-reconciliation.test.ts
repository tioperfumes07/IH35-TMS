import { describe, expect, it } from "vitest";
import { computeFuelMatchRatePct, isFuelDeltaSuspicious } from "../fuel-reconciliation.routes.js";

describe("fuel reconciliation heuristics", () => {
  it("flags deltas beyond the default 10% threshold", () => {
    expect(isFuelDeltaSuspicious(1000, 940)).toBe(false);
    expect(isFuelDeltaSuspicious(1000, 880)).toBe(true);
  });

  it("uses the larger side as the denominator", () => {
    expect(isFuelDeltaSuspicious(50, 500)).toBe(true);
    expect(isFuelDeltaSuspicious(500, 50)).toBe(true);
  });
});

describe("computeFuelMatchRatePct", () => {
  // FUEL-RECON-MATCH-RATE-VS-ROW-MISMATCH: a unit with card dollars but zero WO dollars (or vice
  // versa) must count as unmatched in the aggregate too -- the exact bug was a unit landing in the
  // WO-side source query (and therefore "matched" by a looser key-presence check) despite its real
  // wo_amount_cents being 0.
  it("is 0% when every unit has dollars on only one side", () => {
    const byTruck = [
      { card_amount_cents: 48000, wo_amount_cents: 0 },
      { card_amount_cents: 4000, wo_amount_cents: 0 },
      { card_amount_cents: 0, wo_amount_cents: 0 },
    ];
    expect(computeFuelMatchRatePct(byTruck)).toBe(0);
  });

  it("counts a unit as matched only when both sides have real dollars", () => {
    const byTruck = [
      { card_amount_cents: 48000, wo_amount_cents: 47000 }, // matched
      { card_amount_cents: 4000, wo_amount_cents: 0 }, // unmatched (wo side zero)
      { card_amount_cents: 0, wo_amount_cents: 0 }, // not active at all
    ];
    // 1 matched of 2 active units (the all-zero row is excluded from the denominator)
    expect(computeFuelMatchRatePct(byTruck)).toBe(50);
  });

  it("is 100% (not division-by-zero) when there are no active units at all", () => {
    expect(computeFuelMatchRatePct([])).toBe(100);
    expect(computeFuelMatchRatePct([{ card_amount_cents: 0, wo_amount_cents: 0 }])).toBe(100);
  });

  it("is 100% when every active unit matches on both sides", () => {
    const byTruck = [
      { card_amount_cents: 100, wo_amount_cents: 90 },
      { card_amount_cents: 200, wo_amount_cents: 200 },
    ];
    expect(computeFuelMatchRatePct(byTruck)).toBe(100);
  });
});
