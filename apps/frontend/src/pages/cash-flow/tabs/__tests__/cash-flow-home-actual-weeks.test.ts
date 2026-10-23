import { describe, expect, it } from "vitest";
import { buildActualWeekBuckets } from "../CashFlowHomeTab";

// LEAD 443.273 — "4 weeks actual" + "Weekly run-rate · last 4 full weeks" come from bank-cleared actuals.
const line = (date: string, category: "income" | "expenses" | "net", actual_cents: number) =>
  ({ date, category, projected_cents: 0, actual_cents, variance_cents: 0, variance_pct: null }) as never;

describe("buildActualWeekBuckets", () => {
  const avp = {
    from: "2026-09-21",
    to: "2026-10-18",
    accuracy_summary: {} as never,
    bank_categorization_coverage: { categorized_count: 0, total_count: 0 },
    lines: [
      line("2026-09-21", "income", 100_00),
      line("2026-09-22", "expenses", 40_00),
      line("2026-09-22", "net", 999_99), // net lines are derived — never double-counted
      line("2026-09-30", "income", 50_00),
      line("2026-10-12", "expenses", 30_00),
      line("2026-10-18", "income", 10_00),
      line("2026-10-19", "income", 1_000_00), // current week — not an actual week
    ],
  };

  it("makes 4 Monday-start weeks with cleared income/expenses only", () => {
    const w = buildActualWeekBuckets(avp as never, "2026-09-21", null);
    expect(w.map((x) => x.weekStart)).toEqual(["2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"]);
    expect(w[0]).toMatchObject({ income_cents: 100_00, expenses_cents: 40_00, net_cents: 60_00 });
    expect(w[1]).toMatchObject({ income_cents: 50_00, net_cents: 50_00 });
    expect(w[3]).toMatchObject({ income_cents: 10_00, expenses_cents: 30_00, net_cents: -20_00 });
  });

  it("ending cash walks back from today's opening so actual bars meet the forecast line", () => {
    const w = buildActualWeekBuckets(avp as never, "2026-09-21", 1_000_00);
    expect(w[3].ending_cash_cents).toBe(1_000_00);
    expect(w[2].ending_cash_cents).toBe(1_000_00 - -20_00);
    expect(w[0].ending_cash_cents).toBe(1_000_00 + 20_00 - 0 - 50_00);
  });
});
