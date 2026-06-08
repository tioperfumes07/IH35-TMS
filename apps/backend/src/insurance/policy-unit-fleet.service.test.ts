import { describe, expect, it } from "vitest";
import { computeProRataPremiumDeltaCents } from "./policy-unit-fleet.service.js";

describe("computeProRataPremiumDeltaCents", () => {
  it("pro-rates the per-unit premium by the remaining term fraction", () => {
    // 1-year term, $12,000 premium, 1 unit. Halfway through → ~50% of per-unit premium.
    const result = computeProRataPremiumDeltaCents({
      totalPremiumCents: 1_200_000,
      effectiveDate: "2026-01-01",
      expiryDate: "2027-01-01",
      unitCount: 1,
      asOf: new Date("2026-07-02T00:00:00.000Z"),
    });
    expect(result).toBeGreaterThan(580_000);
    expect(result).toBeLessThan(620_000);
  });

  it("divides the premium across the active unit count", () => {
    const onePer = computeProRataPremiumDeltaCents({
      totalPremiumCents: 1_200_000,
      effectiveDate: "2026-01-01",
      expiryDate: "2027-01-01",
      unitCount: 1,
      asOf: new Date("2026-01-01T00:00:00.000Z"),
    });
    const fourPer = computeProRataPremiumDeltaCents({
      totalPremiumCents: 1_200_000,
      effectiveDate: "2026-01-01",
      expiryDate: "2027-01-01",
      unitCount: 4,
      asOf: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(fourPer).toBe(Math.round(onePer / 4));
  });

  it("returns 0 when the policy has already expired (no term remaining)", () => {
    expect(
      computeProRataPremiumDeltaCents({
        totalPremiumCents: 1_200_000,
        effectiveDate: "2024-01-01",
        expiryDate: "2025-01-01",
        unitCount: 1,
        asOf: new Date("2026-06-07T00:00:00.000Z"),
      })
    ).toBe(0);
  });

  it("returns 0 when the policy carries no premium", () => {
    expect(
      computeProRataPremiumDeltaCents({
        totalPremiumCents: 0,
        effectiveDate: "2026-01-01",
        expiryDate: "2027-01-01",
        unitCount: 1,
      })
    ).toBe(0);
  });

  it("caps the fraction at 1 when added before the effective date", () => {
    const full = computeProRataPremiumDeltaCents({
      totalPremiumCents: 1_200_000,
      effectiveDate: "2026-06-01",
      expiryDate: "2027-06-01",
      unitCount: 1,
      asOf: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(full).toBe(1_200_000);
  });
});
