import { describe, expect, it } from "vitest";
import { buildForecastWeeks } from "../cash-forecast.math.js";

describe("cash forecast math", () => {
  it("projects rolling weekly balances from inflow/outflow buckets", () => {
    const rows = buildForecastWeeks({
      startWeek: "2026-05-25",
      weeks: 2,
      openingBalance: 100_000_00,
      settings: {
        fuel_estimate_weekly_cents: 10_00,
        insurance_weekly_cents: 20_00,
        lease_weekly_cents: 30_00,
        payroll_weekly_cents: 40_00,
      },
      inflowInvoices: new Map([["2026-05-25", 5_000_00]]),
      inflowFactoring: new Map([["2026-05-25", 2_000_00]]),
      outflowBills: new Map([["2026-05-25", 1_000_00]]),
      outflowFactoringFee: new Map([["2026-05-25", 300_00]]),
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.projected_balance).toBe(105_600_00);
    expect(rows[1]?.projected_balance).toBe(105_500_00);
    expect(rows[0]?.expected_inflows.other).toBe(0);
  });

  it("adds proforma/pre-invoice inflows via expected_inflows.other without mixing Open A/R", () => {
    const rows = buildForecastWeeks({
      startWeek: "2026-05-25",
      weeks: 1,
      openingBalance: 100_000_00,
      settings: {
        fuel_estimate_weekly_cents: 0,
        insurance_weekly_cents: 0,
        lease_weekly_cents: 0,
        payroll_weekly_cents: 0,
      },
      inflowInvoices: new Map([["2026-05-25", 1_000_00]]),
      inflowFactoring: new Map(),
      inflowOther: new Map([["2026-05-25", 2_500_00]]),
      outflowBills: new Map(),
      outflowFactoringFee: new Map(),
    });

    expect(rows[0]?.expected_inflows.invoices).toBe(1_000_00);
    expect(rows[0]?.expected_inflows.other).toBe(2_500_00);
    expect(rows[0]?.projected_balance).toBe(103_500_00);
  });
});
