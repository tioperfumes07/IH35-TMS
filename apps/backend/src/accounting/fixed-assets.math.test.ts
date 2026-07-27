import { describe, it, expect } from "vitest";
import { computeDepreciationSchedule, type AssetForCompute } from "./fixed-assets.math.js";

function asset(overrides: Partial<AssetForCompute> = {}): AssetForCompute {
  return {
    purchase_price_cents: 120_000_00,
    salvage_value_cents: 20_000_00,
    in_service_date: "2026-04-01",
    method: "straight_line",
    useful_life_months: 60,
    convention: "half_year",
    prior_accumulated_depr_cents: 0,
    ...overrides,
  };
}

describe("computeDepreciationSchedule — FLT-02 half_year (ASC 360 / MACRS)", () => {
  it("Year-1 sum equals 6× monthly (½ annual), not a single half-month", () => {
    const a = asset();
    const base = a.purchase_price_cents - a.salvage_value_cents;
    const monthly = Math.floor(base / a.useful_life_months);
    const { rows, note } = computeDepreciationSchedule(a);
    expect(note).toBeNull();
    expect(rows.length).toBe(a.useful_life_months + 6);

    const year1 = rows.slice(0, 12).reduce((s, r) => s + r.depreciation_amount_cents, 0);
    expect(year1).toBe(6 * monthly);
  });

  it("schedule total equals cost − salvage exactly", () => {
    const a = asset({ purchase_price_cents: 87_654_321, salvage_value_cents: 1_234_567 });
    const base = a.purchase_price_cents - a.salvage_value_cents;
    const { rows } = computeDepreciationSchedule(a);
    const total = rows.reduce((s, r) => s + r.depreciation_amount_cents, 0);
    expect(total).toBe(base);
    expect(rows[rows.length - 1]?.accumulated_to_date_cents).toBe(base);
  });

  it("full_month takes a full first period (no half-month stub)", () => {
    const a = asset({ convention: "full_month", purchase_price_cents: 60_000_00, salvage_value_cents: 0 });
    const monthly = Math.floor(60_000_00 / 60);
    const { rows } = computeDepreciationSchedule(a);
    expect(rows.length).toBe(60);
    expect(rows[0]?.depreciation_amount_cents).toBe(monthly);
  });

  it("half_month still halves only the first month and adds a stub", () => {
    const a = asset({ convention: "half_month", purchase_price_cents: 60_000_00, salvage_value_cents: 0 });
    const monthly = Math.floor(60_000_00 / 60);
    const { rows } = computeDepreciationSchedule(a);
    expect(rows.length).toBe(61);
    expect(rows[0]?.depreciation_amount_cents).toBe(Math.floor(monthly / 2));
  });

  it("rejects unknown conventions loudly (empty schedule + note)", () => {
    const { rows, note } = computeDepreciationSchedule(asset({ convention: "mid_quarter" }));
    expect(rows).toEqual([]);
    expect(note).toMatch(/Unknown depreciation convention 'mid_quarter'/);
  });
});
