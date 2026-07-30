import { describe, expect, it } from "vitest";
import { previewEvenSplitCents } from "../fleetLeases";

// LEASE-05: the preview must match mdata.allocate_lease_group_evenly to the cent. If the UI shows a
// different number from what the database stores, the operator signs a contract that does not say what
// he was shown.
describe("previewEvenSplitCents", () => {
  it("matches the owner's stated examples exactly", () => {
    // "flatbeds-10 selected total amont 8000 a month ... 800 per flatbed"
    const flatbeds = previewEvenSplitCents(800_000, 10);
    expect(new Set(flatbeds)).toEqual(new Set([80_000])); // $800.00 each
    // "reefer 20 reefers 15,000 a month ... 750 a month"
    const reefers = previewEvenSplitCents(1_500_000, 20);
    expect(new Set(reefers)).toEqual(new Set([75_000])); // $750.00 each
  });

  it("FOOTS EXACTLY when the total does not divide evenly — 60,000 across 7", () => {
    const trucks = previewEvenSplitCents(6_000_000, 7);
    expect(trucks).toHaveLength(7);
    expect(trucks.reduce((a, b) => a + b, 0)).toBe(6_000_000); // not 5,999,994, not 6,000,002
    expect(new Set(trucks)).toEqual(new Set([857_142, 857_143]));
  });

  it("never loses or invents a cent, across many awkward splits", () => {
    for (const total of [1, 7, 99, 100_003, 6_000_000, 1_234_567]) {
      for (const n of [1, 2, 3, 7, 11, 20]) {
        const parts = previewEvenSplitCents(total, n);
        expect(parts).toHaveLength(n);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
        // Largest-remainder never spreads by more than one cent.
        expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("returns nothing for zero lines rather than dividing by zero", () => {
    expect(previewEvenSplitCents(500_000, 0)).toEqual([]);
  });
});
