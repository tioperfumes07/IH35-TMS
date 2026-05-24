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
  });
});
