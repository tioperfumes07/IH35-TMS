import { describe, expect, it } from "vitest";
import { buildRollingLedgerDayGrid } from "../cash-flow.service";

describe("buildRollingLedgerDayGrid arithmetic (CASH-T03 coverage)", () => {
  it("net_cents === income_due - expenses_due every day", () => {
    const days = buildRollingLedgerDayGrid(
      [
        { row_kind: "income", due_date: "2026-11-03", amount_cents: 10_000 },
        { row_kind: "expense", due_date: "2026-11-03", amount_cents: 4_000 },
        { row_kind: "expense", due_date: "2026-11-04", amount_cents: 1_500 },
        { row_kind: "income", due_date: "2026-11-05", amount_cents: 2_000 },
      ],
      "2026-11-03",
      "2026-11-05",
      50_000,
    );
    expect(days).toHaveLength(3);
    for (const d of days) {
      expect(d.net_cents).toBe(d.income_due_cents - d.expenses_due_cents);
    }
    expect(days[0]).toMatchObject({
      income_due_cents: 10_000,
      expenses_due_cents: 4_000,
      net_cents: 6_000,
      running_cash_cents: 56_000,
      income_carry_over_cents: 0,
      expenses_carry_over_cents: 0,
    });
    expect(days[1]).toMatchObject({
      income_due_cents: 0,
      expenses_due_cents: 1_500,
      net_cents: -1_500,
      running_cash_cents: 54_500,
      income_carry_over_cents: 10_000,
      expenses_carry_over_cents: 4_000,
    });
    expect(days[2]).toMatchObject({
      income_due_cents: 2_000,
      expenses_due_cents: 0,
      net_cents: 2_000,
      running_cash_cents: 56_500,
      income_carry_over_cents: 10_000,
      expenses_carry_over_cents: 5_500,
    });
  });

  it("running_cash stays null when opening cash is unknown", () => {
    const days = buildRollingLedgerDayGrid(
      [{ row_kind: "income", due_date: "2026-11-03", amount_cents: 100 }],
      "2026-11-03",
      "2026-11-03",
      null,
    );
    expect(days[0]!.running_cash_cents).toBeNull();
    expect(days[0]!.net_cents).toBe(100);
  });
});
