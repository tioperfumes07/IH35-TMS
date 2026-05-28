import { describe, expect, it } from "vitest";
import { resolveAllocation } from "./allocation.js";

describe("resolveAllocation", () => {
  const assets = [
    { id: "00000000-0000-0000-0000-000000000001", insured_value_cents: 10000 },
    { id: "00000000-0000-0000-0000-000000000002", insured_value_cents: 30000 },
    { id: "00000000-0000-0000-0000-000000000003", insured_value_cents: 60000 },
  ];

  it("allocates equal method penny-exact", () => {
    const rows = resolveAllocation("equal", assets, 10001);
    expect(rows).toHaveLength(3);
    expect(rows.reduce((sum, row) => sum + row.allocated_amount_cents, 0)).toBe(10001);
    expect(rows[0].allocated_amount_cents).toBeGreaterThanOrEqual(rows[1].allocated_amount_cents);
  });

  it("allocates by value", () => {
    const rows = resolveAllocation("by_value", assets, 10000);
    expect(rows.map((row) => row.allocated_amount_cents)).toEqual([1000, 3000, 6000]);
    expect(rows.reduce((sum, row) => sum + row.allocated_amount_cents, 0)).toBe(10000);
  });

  it("allocates by miles", () => {
    const rows = resolveAllocation("by_miles", assets, 10000, undefined, {
      "00000000-0000-0000-0000-000000000001": 100,
      "00000000-0000-0000-0000-000000000002": 300,
      "00000000-0000-0000-0000-000000000003": 600,
    });
    expect(rows.map((row) => row.allocated_amount_cents)).toEqual([1000, 3000, 6000]);
  });

  it("allocates manual percentages and rejects invalid totals", () => {
    const rows = resolveAllocation("manual_pct", assets, 10001, {
      "00000000-0000-0000-0000-000000000001": 20,
      "00000000-0000-0000-0000-000000000002": 30,
      "00000000-0000-0000-0000-000000000003": 50,
    });
    expect(rows.reduce((sum, row) => sum + row.allocated_amount_cents, 0)).toBe(10001);

    expect(() =>
      resolveAllocation("manual_pct", assets, 10000, {
        "00000000-0000-0000-0000-000000000001": 20,
        "00000000-0000-0000-0000-000000000002": 30,
        "00000000-0000-0000-0000-000000000003": 40,
      })
    ).toThrow("allocation_manual_pct_sum_invalid");
  });

  it("handles single-asset edge case", () => {
    const rows = resolveAllocation("equal", [assets[0]], 9999);
    expect(rows).toEqual([
      {
        asset_id: "00000000-0000-0000-0000-000000000001",
        allocation_method: "equal",
        allocation_pct: 100,
        allocated_amount_cents: 9999,
      },
    ]);
  });
});
