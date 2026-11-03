import { describe, expect, it } from "vitest";
import { getActualVsProjected, getDailyPrediction, datesBetween } from "../cash-flow.service.js";

// LEAD 11-03 E8 (row 261) after Codex batch38: Actual vs Projected's projected expense for a day must be the daily
// engine's own number — every source, open balance for a part-paid bill — and a past day without a captured
// expense projection is "not captured", never $0. Executable fixtures, one row per engine source.
const CO = "11111111-1111-4111-8111-111111111111";
const FUTURE = "2099-03-10";

/** Fake DB: each engine expense source returns one row; everything else empty. */
function engineClient(extra: (sql: string) => { rows: unknown[] } | null = () => null) {
  return {
    query: async (sql: string) => {
      const x = extra(sql);
      if (x) return x;
      if (sql.includes("FROM driver_finance.driver_settlements s") && sql.includes("AS driver_name")) {
        return { rows: [{ id: "s1", display_id: "S-1", driver_name: "A", load_id: null, amount_cents: 50_000 }] };
      }
      // part-paid A/P bill: amount 10,000, paid 4,000 → engine projects the open 6,000
      if (sql.includes("FROM accounting.bills b") && sql.includes("remaining_balance_cents")) {
        return { rows: [{ id: "b1", vendor_name: "V", amount_cents: 10_000, remaining_balance_cents: 6_000 }] };
      }
      if (sql.includes("FROM accounting.cash_flow_adjustments")) return { rows: [{ id: "a1", label: "Adj", amount_cents: 700 }] };
      if (sql.includes("FROM accounting.expenses e")) return { rows: [{ id: "e1", vendor_name: "Fuel", amount_cents: 2_500, load_id: null }] };
      if (sql.includes("FROM integrations.relay_deposits rd")) return { rows: [{ id: "r1", label: "Relay", amount_cents: 3_000 }] };
      if (sql.includes("FROM driver_finance.driver_bills db")) {
        return { rows: [{ id: "d1", driver_name: "B", amount_cents: 8_000, amount_known: true, load_id: null }] };
      }
      return { rows: [] };
    },
  };
}

describe("E8 — Actual vs Projected projected expenses = the daily engine", () => {
  it("a future day: AvP expense projected_cents equals getDailyPrediction().expense_subtotal_cents (all 6 sources, open balance)", async () => {
    const daily = await getDailyPrediction(engineClient() as never, CO, FUTURE);
    expect(daily.expense_subtotal_cents).toBe(50_000 + 6_000 + 700 + 2_500 + 3_000 + 8_000);
    const avp = await getActualVsProjected(engineClient() as never, CO, FUTURE, FUTURE);
    const exp = avp.lines.find((l) => l.date === FUTURE && l.category === "expenses");
    expect(exp?.projected_cents).toBe(daily.expense_subtotal_cents);
    expect(exp?.projected_basis).toBe("engine");
    expect(exp?.projected_unavailable).toBeUndefined();
    expect(avp.accuracy_summary.total_projected_expense_cents).toBe(daily.expense_subtotal_cents);
  });

  it("a past day reads the morning snapshot of that engine", async () => {
    const client = engineClient((sql) =>
      sql.includes("FROM forecast.cash_flow_projection_snapshots")
        ? { rows: [{ prediction_date: "2020-01-02", projected_income_cents: 0, projected_expense_cents: "70200", captured_at: "2020-01-02 12:10:00+00" }] }
        : null
    );
    const avp = await getActualVsProjected(client as never, CO, "2020-01-02", "2020-01-02");
    const exp = avp.lines.find((l) => l.date === "2020-01-02" && l.category === "expenses");
    expect(exp?.projected_cents).toBe(70_200);
    expect(exp?.projected_basis).toBe("snapshot");
    expect(exp?.projected_captured_at).toBe("2020-01-02 12:10:00+00");
  });

  it("a past day with no expense snapshot is NOT CAPTURED (never $0 variance, never re-run against today's state)", async () => {
    const client = engineClient((sql) => {
      if (sql.includes("FROM forecast.cash_flow_projection_snapshots")) {
        return { rows: [{ prediction_date: "2020-01-03", projected_income_cents: 100, projected_expense_cents: null, captured_at: "x" }] };
      }
      if (sql.includes("AS actual_income_cents")) return { rows: [{ actual_date: "2020-01-03", actual_income_cents: "0", actual_expense_cents: "9999" }] };
      return null;
    });
    const avp = await getActualVsProjected(client as never, CO, "2020-01-03", "2020-01-03");
    const exp = avp.lines.find((l) => l.date === "2020-01-03" && l.category === "expenses");
    expect(exp?.projected_basis).toBe("not_captured");
    expect(exp?.projected_unavailable).toBe(true);
    expect(exp?.variance_pct).toBeNull();
    // the matched comparison leaves the not-captured day out on BOTH sides; the RAW actual keeps it (Codex batch41)
    expect(avp.accuracy_summary.matched_projected_expense_cents).toBe(0);
    expect(avp.accuracy_summary.matched_actual_expense_cents).toBe(0);
    expect(avp.accuracy_summary.expense_variance_pct).toBeNull();
    expect(avp.accuracy_summary.total_actual_expense_cents).toBe(9999);
  });

  it("datesBetween is inclusive and empty when reversed", () => {
    expect(datesBetween("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(datesBetween("2026-11-02", "2026-11-01")).toEqual([]);
  });
});
