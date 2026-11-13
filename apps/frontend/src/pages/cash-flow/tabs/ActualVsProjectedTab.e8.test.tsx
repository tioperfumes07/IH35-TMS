import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import {
  AvpCompareChart,
  ProjectedExpenseCell,
  buildAvpActualDrillHref,
  buildAvpProjectedDrillHref,
  buildAvpChartPoints,
  buildAvpChartSeries,
  accuracyPct,
  matchedCoverageNets,
  matchedExpenseAccuracyCoverage,
  projectedExpensePolylineSegments,
  projectedNetExcludingNotCaptured,
  rawActualNetFromGroups,
} from "./ActualVsProjectedTab";
import type { AvpLineItem } from "../../../api/cashFlow";
import { decodeReturnContext, RETURN_PARAM } from "../../../lib/returnContext";

// ProjectedExpenseCell / AvpCompareChart live beside the tab's useQuery; supply the provider the module consumes.
function renderWithQuery(ui: ReactElement) {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

// E8 11-03 (row 261): a past day before expense capture is "not captured", never a projected $0.
const base: AvpLineItem = { date: "2026-10-05", category: "expenses", projected_cents: 0, actual_cents: 9999, variance_cents: 0, variance_pct: null };

function dayGroup(opts: {
  date: string;
  actInc: number;
  actExp: number;
  projInc?: number;
  projExp?: number;
  projected_unavailable?: boolean;
  actual_unavailable?: boolean;
}) {
  const projected_unavailable = !!opts.projected_unavailable;
  const actual_unavailable = !!opts.actual_unavailable;
  const projInc = opts.projInc ?? 0;
  const projExp = opts.projExp ?? 0;
  return {
    date: opts.date,
    income: {
      date: opts.date,
      category: "income" as const,
      projected_cents: projInc,
      actual_cents: opts.actInc,
      variance_cents: opts.actInc - projInc,
      variance_pct: null,
      actual_unavailable,
    },
    expenses: {
      date: opts.date,
      category: "expenses" as const,
      projected_cents: projExp,
      actual_cents: opts.actExp,
      variance_cents: opts.actExp - projExp,
      variance_pct: null,
      projected_basis: projected_unavailable ? ("not_captured" as const) : ("engine" as const),
      projected_unavailable,
      actual_unavailable,
    },
    net: {
      date: opts.date,
      category: "net" as const,
      projected_cents: projInc - projExp,
      actual_cents: opts.actInc - opts.actExp,
      variance_cents: 0,
      variance_pct: null,
    },
  };
}

describe("ProjectedExpenseCell", () => {
  it("not_captured renders 'not captured', never $0", () => {
    renderWithQuery(<ProjectedExpenseCell line={{ ...base, projected_basis: "not_captured", projected_unavailable: true }} />);
    expect(screen.getByTestId("cash-flow-avp-proj-exp-not-captured").textContent).toBe("not captured");
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it("snapshot renders the amount plus its capture provenance", () => {
    renderWithQuery(
      <ProjectedExpenseCell
        line={{ ...base, projected_cents: 70_200, projected_basis: "snapshot", projected_captured_at: "2026-11-04T12:10:00Z" }}
      />
    );
    expect(screen.getByText(/702\.00/)).toBeTruthy();
    expect(screen.getByText(/^snapshot /)).toBeTruthy();
  });

  it("engine (today/later) renders the amount with no snapshot label; older servers (no basis) still render the amount", () => {
    const { unmount } = renderWithQuery(<ProjectedExpenseCell line={{ ...base, projected_cents: 5_000, projected_basis: "engine" }} />);
    expect(screen.getByText(/50\.00/)).toBeTruthy();
    expect(screen.queryByText(/^snapshot /)).toBeNull();
    unmount();
    renderWithQuery(<ProjectedExpenseCell line={{ ...base, projected_cents: 5_000 }} />);
    expect(screen.getByText(/50\.00/)).toBeTruthy();
  });
});

describe("E8 row261 raw actual net vs coverage", () => {
  it("counterexample: income10000/expense9999 on a not-captured day → raw net 1, never 10000", () => {
    const groups = [
      dayGroup({
        date: "2026-10-05",
        actInc: 10_000,
        actExp: 9_999,
        projInc: 0,
        projExp: 0,
        projected_unavailable: true,
      }),
    ];
    // Bad: accuracy_summary-style net that drops expense but keeps income → 10000
    const badCoverageStyleNet = 10_000 - 0;
    expect(badCoverageStyleNet).toBe(10_000);
    const raw = rawActualNetFromGroups(groups);
    expect(raw.income_cents).toBe(10_000);
    expect(raw.expense_cents).toBe(9_999);
    expect(raw.net_cents).toBe(1);
    // Projected net excludes the not-captured day entirely (never treats proj expense as $0)
    expect(projectedNetExcludingNotCaptured(groups)).toBe(0);
  });

  it("chart points leave projectedExpenses null on not-captured days", () => {
    const groups = [
      dayGroup({ date: "2026-10-05", actInc: 10_000, actExp: 9_999, projected_unavailable: true }),
      dayGroup({ date: "2026-10-06", actInc: 500, actExp: 200, projInc: 400, projExp: 150 }),
    ];
    const points = buildAvpChartPoints(groups);
    expect(points[0].projectedExpenses).toBeNull();
    expect(points[0].actualIncome).toBe(10_000);
    expect(points[0].actualExpenses).toBe(9_999);
    expect(points[1].projectedExpenses).toBe(150);
  });
});

describe("E8 batch45 matched coverage + chart gaps", () => {
  it("all-not-captured day: raw net 1, matched variance unavailable (null)", () => {
    const groups = [
      dayGroup({
        date: "2026-10-05",
        actInc: 10_000,
        actExp: 9_999,
        projected_unavailable: true,
      }),
    ];
    const cov = matchedCoverageNets(groups);
    expect(cov.raw_actual_net_cents).toBe(1);
    expect(cov.matched_days).toBe(0);
    expect(cov.matched_variance_cents).toBeNull();
    // Never invent variance = rawNet - 0 against unavailable projection
    expect(cov.raw_actual_net_cents - 0).toBe(1);
  });

  it("cumulative series keeps null gap on not-captured days (does not write pe back)", () => {
    const groups = [
      dayGroup({ date: "2026-10-05", actInc: 100, actExp: 50, projected_unavailable: true }),
      dayGroup({ date: "2026-10-06", actInc: 200, actExp: 80, projInc: 180, projExp: 70 }),
      dayGroup({ date: "2026-10-07", actInc: 50, actExp: 20, projected_unavailable: true }),
    ];
    const points = buildAvpChartPoints(groups);
    const series = buildAvpChartSeries(points, "cumulative");
    expect(series[0].projectedExpenses).toBeNull();
    expect(series[1].projectedExpenses).toBe(70);
    expect(series[2].projectedExpenses).toBeNull();
    const segs = projectedExpensePolylineSegments(
      series,
      (i) => i * 10,
      (c) => c,
    );
    // one contiguous captured day → one segment; gaps skipped
    expect(segs).toHaveLength(1);
    expect(segs[0]).toContain("10.0");
  });

  it("matched variance uses only captured days", () => {
    const groups = [
      dayGroup({ date: "2026-10-05", actInc: 10_000, actExp: 9_999, projected_unavailable: true }),
      dayGroup({ date: "2026-10-06", actInc: 500, actExp: 200, projInc: 400, projExp: 150 }),
    ];
    const cov = matchedCoverageNets(groups);
    expect(cov.raw_actual_net_cents).toBe(1 + 300);
    expect(cov.matched_days).toBe(1);
    expect(cov.matched_actual_net_cents).toBe(300);
    expect(cov.matched_projected_net_cents).toBe(250);
    expect(cov.matched_variance_cents).toBe(50);
  });

  it("batch64 expense accuracy uses matched coverage (proj10000/matchedAct10000/raw20000 → 100%, not 50%)", () => {
    const groups = [
      dayGroup({ date: "2026-10-05", actInc: 0, actExp: 10_000, projInc: 0, projExp: 10_000 }),
      dayGroup({ date: "2026-10-06", actInc: 0, actExp: 10_000, projInc: 0, projExp: 0, projected_unavailable: true }),
    ];
    const cov = matchedExpenseAccuracyCoverage(groups);
    expect(cov.matched_days).toBe(1);
    expect(cov.matched_projected_expense_cents).toBe(10_000);
    expect(cov.matched_actual_expense_cents).toBe(10_000);
    const rawActualExpense = 20_000;
    expect(accuracyPct(cov.matched_projected_expense_cents, rawActualExpense)).toBe(50);
    expect(accuracyPct(cov.matched_projected_expense_cents, cov.matched_actual_expense_cents)).toBe(100);
  });

  it("batch64 expense accuracy unavailable when every day is not-captured", () => {
    const groups = [
      dayGroup({ date: "2026-10-05", actInc: 0, actExp: 9_999, projected_unavailable: true }),
    ];
    expect(matchedExpenseAccuracyCoverage(groups).matched_days).toBe(0);
  });

  it("renders projected-expense legend + polyline (not only income/actual lines)", () => {
    const groups = [
      dayGroup({ date: "2026-10-05", actInc: 100, actExp: 50, projected_unavailable: true }),
      dayGroup({ date: "2026-10-06", actInc: 200, actExp: 80, projInc: 180, projExp: 70 }),
    ];
    const points = buildAvpChartPoints(groups);
    renderWithQuery(<AvpCompareChart points={points} grain="daily" expNotCapturedDays={1} />);
    expect(screen.getByTestId("cash-flow-avp-proj-exp-legend").textContent).toMatch(/Projected expenses/i);
    expect(screen.getAllByTestId("cash-flow-avp-proj-exp-polyline").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("cash-flow-avp-chart-svg").querySelectorAll("polyline").length).toBeGreaterThanOrEqual(4);
  });

  it("ROUND 8.20 board6 — Actual Income/Exp drill Banking same-day cohort with ret", () => {
    const origin = "/cash-flow?tab=actual_vs_projected&avp_var=under";
    const income = buildAvpActualDrillHref({ category: "income", date: "2026-11-03" }, origin);
    const expense = buildAvpActualDrillHref({ category: "expenses", date: "2026-11-03" }, origin);
    expect(income).toContain("types=money_in");
    expect(expense).toContain("types=money_out");
    expect(income).toContain("review=all");
    expect(expense).toContain("review=all");
    expect(income).toContain("date_from=2026-11-03");
    expect(income).toContain("date_to=2026-11-03");
    const q = new URLSearchParams(income.slice(income.indexOf("?") + 1));
    expect(decodeReturnContext(q.get(RETURN_PARAM))).toBe(origin);
  });

  it("ROUND 8.20 board6 — Projected Income/Exp drill Rolling Ledger same-day cohort with ret", () => {
    const origin = "/cash-flow?tab=actual_vs_projected&avp_var=over";
    const income = buildAvpProjectedDrillHref({ category: "income", date: "2026-11-03" }, origin);
    const expense = buildAvpProjectedDrillHref({ category: "expenses", date: "2026-11-03" }, origin);
    expect(income).toContain("tab=rolling_ledger");
    expect(expense).toContain("tab=rolling_ledger");
    expect(income).toContain("rl_kind=income");
    expect(expense).toContain("rl_kind=expenses");
    expect(income).toContain("rl_from=2026-11-03");
    expect(income).toContain("rl_to=2026-11-03");
    expect(expense).toContain("rl_from=2026-11-03");
    const q = new URLSearchParams(income.slice(income.indexOf("?") + 1));
    expect(decodeReturnContext(q.get(RETURN_PARAM))).toBe(origin);
  });
});
