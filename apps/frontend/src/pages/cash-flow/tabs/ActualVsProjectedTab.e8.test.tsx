import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ProjectedExpenseCell,
  buildAvpChartPoints,
  buildAvpChartSeries,
  matchedCoverageNets,
  projectedExpensePolylineSegments,
  projectedNetExcludingNotCaptured,
  rawActualNetFromGroups,
} from "./ActualVsProjectedTab";
import type { AvpLineItem } from "../../../api/cashFlow";

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
    render(<ProjectedExpenseCell line={{ ...base, projected_basis: "not_captured", projected_unavailable: true }} />);
    expect(screen.getByTestId("cash-flow-avp-proj-exp-not-captured").textContent).toBe("not captured");
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it("snapshot renders the amount plus its capture provenance", () => {
    render(
      <ProjectedExpenseCell
        line={{ ...base, projected_cents: 70_200, projected_basis: "snapshot", projected_captured_at: "2026-11-04T12:10:00Z" }}
      />
    );
    expect(screen.getByText(/702\.00/)).toBeTruthy();
    expect(screen.getByText(/^snapshot /)).toBeTruthy();
  });

  it("engine (today/later) renders the amount with no snapshot label; older servers (no basis) still render the amount", () => {
    const { unmount } = render(<ProjectedExpenseCell line={{ ...base, projected_cents: 5_000, projected_basis: "engine" }} />);
    expect(screen.getByText(/50\.00/)).toBeTruthy();
    expect(screen.queryByText(/^snapshot /)).toBeNull();
    unmount();
    render(<ProjectedExpenseCell line={{ ...base, projected_cents: 5_000 }} />);
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
});
