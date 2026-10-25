import { useMemo, useState } from "react";
import { localDateFromIso } from "../../../lib/businessDate";
import { DatePicker } from "../../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../../components/table";
import { SelectCombobox } from "../../../components/Combobox";
import { getActualVsProjected, type ActualVsProjectedResult, type AvpLineItem } from "../../../api/cashFlow";
import { addDaysIso, companyToday } from "../../../lib/businessDate";
import { formatDateTimeUS, formatDateUS } from "../../../lib/formatDate";
import { formatUsdCents } from "../../../lib/money";
import { V3 } from "../../../design/v3-tokens";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { BoardSection } from "../../../components/v3/BoardSection";
import { V3Segmented } from "../../../components/v3/V3Segmented";

// CASHFLOW-1: range must end on the company business date (Central), not the UTC date — otherwise the
// "To" defaults to tomorrow after ~7 PM Central. See lib/businessDate.
function todayIso(): string {
  return companyToday();
}

function sevenDaysAgoIso(): string {
  return addDaysIso(companyToday(), -7);
}

function formatCents(cents: number, opts?: { sign?: boolean }): string {
  const abs = Math.abs(cents);
  const dollars = formatUsdCents(abs);
  if (opts?.sign && cents > 0) return `+${dollars}`;
  if (opts?.sign && cents < 0) return `−${dollars}`;
  return cents < 0 ? `−${dollars}` : dollars;
}

function formatPct(pct: number | null): string {
  if (pct === null) return "—";
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

/** D043 — owner 10-24: MM/DD/YYYY range labels (no month-name / year-less). */
function shortRangeLabel(from: string, to: string): string {
  return `${formatDateUS(from)} – ${formatDateUS(to)}`;
}

function dayCountInclusive(from: string, to: string): number {
  const a = localDateFromIso(from).getTime();
  const b = localDateFromIso(to).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

type Props = {
  operatingCompanyId: string;
};

type RowGroup = {
  date: string;
  income: AvpLineItem;
  expenses: AvpLineItem;
  net: AvpLineItem;
};

function groupByDate(lines: AvpLineItem[]): RowGroup[] {
  const map = new Map<string, Partial<RowGroup>>();
  for (const line of lines) {
    const g = map.get(line.date) ?? {};
    if (line.category === "income") g.income = line;
    else if (line.category === "expenses") g.expenses = line;
    else if (line.category === "net") g.net = line;
    g.date = line.date;
    map.set(line.date, g);
  }
  return Array.from(map.values())
    .filter((g): g is RowGroup => !!g.date && !!g.income && !!g.expenses && !!g.net)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function VarianceCell({ variance_cents, variance_pct }: { variance_cents: number; variance_pct: number | null }) {
  const pos = variance_cents > 0;
  const zero = variance_cents === 0;
  return (
    <div
      className="flex flex-col items-end"
      style={{ color: zero ? V3.muted : pos ? V3.ink : V3.red }}
    >
      <span className="font-semibold">{formatCents(variance_cents, { sign: true })}</span>
      <span className="text-xs">{formatPct(variance_pct)}</span>
    </div>
  );
}

// Column order/formatting preserved 1:1 from the former hand-rolled table markup (display-only migration).
const COLUMNS: Array<ParityColumn<RowGroup>> = [
  {
    key: "date",
    label: "Date",
    sortable: true,
    className: "text-left",
    render: (g) => (
      <span className="font-medium" style={{ color: V3.ink }}>
        {formatDateUS(g.date)}
      </span>
    ),
  },
  {
    key: "projected_income",
    label: "Projected Income",
    sortable: true,
    className: "text-right",
    sortValue: (g) => g.income.projected_cents,
    render: (g) => (
      <span style={{ color: V3.ink }}>
        {formatCents(g.income.projected_cents)}
        {/* DEAD-SCHEMA-CASH-FLOW-SNAPSHOT-CAPTURED-AT-UNREAD — honest provenance: this figure is a
            frozen daily snapshot, not a live recomputation. Shown only when the backend actually
            sourced it from forecast.cash_flow_projection_snapshots. */}
        {g.income.projected_captured_at ? (
          <span
            className="block text-xs"
            style={{ color: V3.mutedSoft }}
            title={`Frozen snapshot captured ${formatDateTimeUS(g.income.projected_captured_at)}`}
          >
            snapshot {formatDateUS(g.income.projected_captured_at)}
          </span>
        ) : null}
      </span>
    ),
  },
  {
    key: "actual_income",
    label: "Actual Income",
    sortable: true,
    className: "text-right",
    sortValue: (g) => g.income.actual_cents,
    render: (g) => <ActualCell line={g.income} />,
  },
  {
    key: "income_variance",
    label: "Income Variance",
    sortable: true,
    className: "text-right",
    sortValue: (g) => g.income.variance_cents,
    render: (g) =>
      g.income.actual_unavailable ? (
        <span className="text-xs" style={{ color: V3.mutedSoft }}>
          —
        </span>
      ) : (
        <VarianceCell variance_cents={g.income.variance_cents} variance_pct={g.income.variance_pct} />
      ),
  },
  {
    key: "projected_expenses",
    label: "Projected Exp.",
    sortable: true,
    className: "text-right",
    sortValue: (g) => g.expenses.projected_cents,
    render: (g) => <span style={{ color: V3.ink }}>{formatCents(g.expenses.projected_cents)}</span>,
  },
  {
    key: "actual_expenses",
    label: "Actual Exp.",
    sortable: true,
    className: "text-right",
    sortValue: (g) => g.expenses.actual_cents,
    render: (g) => <ActualCell line={g.expenses} />,
  },
  {
    key: "expense_variance",
    label: "Exp. Variance",
    sortable: true,
    className: "text-right",
    sortValue: (g) => g.expenses.variance_cents,
    render: (g) =>
      g.expenses.actual_unavailable ? (
        <span className="text-xs" style={{ color: V3.mutedSoft }}>
          —
        </span>
      ) : (
        <VarianceCell variance_cents={g.expenses.variance_cents} variance_pct={g.expenses.variance_pct} />
      ),
  },
  {
    key: "net",
    label: "Net",
    sortable: true,
    className: "text-right",
    sortValue: (g) => g.net.actual_cents,
    render: (g) =>
      g.income.actual_unavailable || g.expenses.actual_unavailable ? (
        <span
          className="text-xs"
          style={{ color: V3.mutedSoft }}
          title="Actual net depends on actual income/expenses, both unavailable"
        >
          —
        </span>
      ) : (
        <span className="font-bold" style={{ color: g.net.actual_cents >= 0 ? V3.ink : V3.red }}>
          {formatCents(g.net.actual_cents, { sign: true })}
        </span>
      ),
  },
];

// CASH-FLOW-01 (owner order 2026-09-06, LAW §8 "zero is a claim"): actual_unavailable means the
// backend measured 0 categorized bank lines company-wide -- a bare $0 here would read as
// "confirmed zero cash moved" when the truth is "we cannot see actuals yet". Render the honest
// state instead of the number.
function ActualCell({ line }: { line: AvpLineItem }) {
  if (line.actual_unavailable) {
    return (
      <span
        className="text-xs"
        style={{ color: V3.mutedSoft }}
        title="0 bank lines categorized — actuals unavailable, not a confirmed zero"
      >
        unavailable
      </span>
    );
  }
  return <span style={{ color: V3.ink }}>{formatCents(line.actual_cents)}</span>;
}

type VarianceFilter = "all" | "over" | "under" | "flat";
type AvpFilterDraft = {
  from: string;
  to: string;
  varianceFilter: VarianceFilter;
};
type ChartGrain = "cumulative" | "daily";

type ChartPoint = {
  date: string;
  label: string;
  actualIncome: number;
  projectedIncome: number;
  actualExpenses: number;
  projectedExpenses: number;
};

function accuracyVerb(
  projected: number,
  actual: number,
  unavailable: boolean,
): { text: string; tone: "ink" | "green" | "red" | "muted"; accent: string } {
  if (unavailable) return { text: "actuals unavailable", tone: "muted", accent: V3.muted };
  if (projected === 0 && actual > 0) return { text: "▼ not projected", tone: "red", accent: V3.amber };
  if (projected === 0 && actual === 0) return { text: "flat", tone: "muted", accent: V3.muted };
  if (actual > projected) return { text: "▼ under-projected", tone: "red", accent: V3.red };
  if (actual < projected) return { text: "▲ over-projected", tone: "green", accent: V3.green };
  return { text: "on projection", tone: "ink", accent: V3.ink };
}

function AvpCompareChart({ points, grain }: { points: ChartPoint[]; grain: ChartGrain }) {
  const series = useMemo(() => {
    let ai = 0;
    let pi = 0;
    let ae = 0;
    let pe = 0;
    return points.map((p) => {
      if (grain === "cumulative") {
        ai += p.actualIncome;
        pi += p.projectedIncome;
        ae += p.actualExpenses;
        pe += p.projectedExpenses;
        return { ...p, actualIncome: ai, projectedIncome: pi, actualExpenses: ae, projectedExpenses: pe };
      }
      return p;
    });
  }, [points, grain]);

  const W = 1100;
  const H = 280;
  const left = 56;
  const right = 1080;
  const top = 20;
  const bottom = 240;
  const plotW = right - left;
  const plotH = bottom - top;
  const maxAbs = Math.max(
    1,
    ...series.flatMap((p) => [p.actualIncome, p.projectedIncome, p.actualExpenses, p.projectedExpenses]),
  );
  const yOf = (cents: number) => bottom - (cents / maxAbs) * plotH;
  const n = Math.max(series.length, 1);
  const xOf = (i: number) => left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);

  const poly = (key: keyof ChartPoint) =>
    series
      .map((p, i) => `${xOf(i).toFixed(1)},${yOf(Number(p[key])).toFixed(1)}`)
      .join(" ");

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxAbs * t));
  const projExpensesAllZero = series.every((p) => p.projectedExpenses === 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 11, color: V3.muted }}>
        <span>
          <span style={{ display: "inline-block", width: 14, height: 2, background: V3.data, verticalAlign: "middle", marginRight: 4 }} />
          Actual income (bank)
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 14,
              borderTop: `2px dashed ${V3.link}`,
              verticalAlign: "middle",
              marginRight: 4,
            }}
          />
          Projected income
        </span>
        <span>
          <span style={{ display: "inline-block", width: 14, height: 2, background: V3.slate, verticalAlign: "middle", marginRight: 4 }} />
          Actual expenses (bank)
        </span>
      </div>
      {projExpensesAllZero ? (
        <p className="text-xs" style={{ color: V3.amber }} data-testid="cash-flow-avp-proj-exp-zero-note">
          Projected expenses: $0 every day — the engine projects none
        </p>
      ) : null}
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} data-testid="cash-flow-avp-chart-svg">
        {ticks.map((cents) => {
          const y = yOf(cents);
          const label = cents === 0 ? "$0" : `$${Math.round(cents / 100 / 1000)}k`;
          return (
            <g key={cents}>
              <line x1={left} x2={right} y1={y} y2={y} stroke={cents === 0 ? V3.slate : V3.chartGrid} />
              <text x={left - 8} y={y + 4} textAnchor="end" fontFamily={V3.font} fontSize={10} fill={V3.muted}>
                {label}
              </text>
            </g>
          );
        })}
        <polyline className="cf-v3-draw" pathLength={1} points={poly("actualIncome")} fill="none" stroke={V3.data} strokeWidth={2.2} />
        <polyline
          className="cf-v3-draw"
          pathLength={1}
          points={poly("projectedIncome")}
          fill="none"
          stroke={V3.link}
          strokeWidth={1.8}
          strokeDasharray="6 4"
        />
        <polyline className="cf-v3-draw" pathLength={1} points={poly("actualExpenses")} fill="none" stroke={V3.slate} strokeWidth={2} />
        {series.map((p, i) => (
          <text key={p.date} x={xOf(i)} y={H - 12} textAnchor="middle" fontFamily={V3.font} fontSize={10} fill={V3.muted}>
            {p.label}
          </text>
        ))}
      </svg>
      <style>{`
        @keyframes cf-v3-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        .cf-v3-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: cf-v3-draw 1.4s ease-out .15s forwards; }
      `}</style>
    </div>
  );
}

export function ActualVsProjectedTab({ operatingCompanyId }: Props) {
  // LV-CASH-FLOW-ACTUAL-SPLIT-FILTER-APPLY — From/To + Net variance share one staged Filters draft.
  const defaultFrom = sevenDaysAgoIso();
  const defaultTo = todayIso();
  const [applied, setApplied] = useState<AvpFilterDraft>({ from: defaultFrom, to: defaultTo, varianceFilter: "all" });
  const [chartGrain, setChartGrain] = useState<ChartGrain>("cumulative");
  const staged = useStagedListFilters({
    applied,
    empty: { from: defaultFrom, to: defaultTo, varianceFilter: "all" as VarianceFilter },
    onApply: (next) => {
      if (next.from > next.to) return;
      setApplied(next);
    },
  });
  const draftInvalid = staged.draft.from > staged.draft.to;
  const activeFilterCount =
    (applied.varianceFilter === "all" ? 0 : 1) +
    (applied.from !== defaultFrom || applied.to !== defaultTo ? 1 : 0);

  const avpQ = useQuery<ActualVsProjectedResult>({
    queryKey: ["cash-flow-avp", operatingCompanyId, applied.from, applied.to],
    queryFn: () => getActualVsProjected(operatingCompanyId, applied.from, applied.to),
    enabled: !!operatingCompanyId && applied.from <= applied.to,
  });
  const { data, isLoading, isError } = avpQ;

  const groups = data ? groupByDate(data.lines) : [];
  const filteredGroups = useMemo(() => {
    if (applied.varianceFilter === "all") return groups;
    return groups.filter((g) => {
      const v = g.net.variance_cents;
      if (applied.varianceFilter === "over") return v > 0;
      if (applied.varianceFilter === "under") return v < 0;
      return v === 0;
    });
  }, [groups, applied.varianceFilter]);
  const acc = data?.accuracy_summary;
  const actualsUnavailable = data?.bank_categorization_coverage.categorized_count === 0;

  const chartPoints: ChartPoint[] = useMemo(
    () =>
      groups.map((g) => ({
        date: g.date,
        label: formatDateUS(g.date),
        actualIncome: g.income.actual_unavailable ? 0 : g.income.actual_cents,
        projectedIncome: g.income.projected_cents,
        actualExpenses: g.expenses.actual_unavailable ? 0 : g.expenses.actual_cents,
        projectedExpenses: g.expenses.projected_cents,
      })),
    [groups],
  );

  return (
    <div className="space-y-4" style={{ fontFamily: V3.font }} data-testid="cash-flow-avp-v3-root">
      {/* Single staged Filters — From/To + Net variance (no split Apply-only date chrome). */}
      <CollapsedListFilters
        activeFilterCount={activeFilterCount}
        onApply={staged.apply}
        onReset={staged.reset}
        onCancel={staged.cancel}
        applyDisabled={!staged.dirty || draftInvalid}
        testIdPrefix="cash-flow-avp"
        dataAttributes={{ "data-cash-flow-avp-filter-toolbar": "collapsed" }}
        className="rounded-sm border border-gray-200 bg-white p-2"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold" style={{ color: V3.muted }}>
            From
            <DatePicker
              value={staged.draft.from}
              onChange={(next) => staged.setDraft({ ...staged.draft, from: next })}
              className="mt-1"
            />
          </label>
          <label className="text-xs font-semibold" style={{ color: V3.muted }}>
            To
            <DatePicker
              value={staged.draft.to}
              onChange={(next) => staged.setDraft({ ...staged.draft, to: next })}
              className="mt-1"
            />
          </label>
          <label className="text-xs font-semibold" style={{ color: V3.muted }}>
            Net variance
            <SelectCombobox
              className="mt-1 block w-full max-w-xs"
              value={staged.draft.varianceFilter}
              onChange={(event) =>
                staged.setDraft({
                  ...staged.draft,
                  varianceFilter: event.target.value as VarianceFilter,
                })
              }
              data-testid="cash-flow-avp-variance-filter"
            >
              <option value="all">All rows</option>
              <option value="over">Net over projected</option>
              <option value="under">Net under projected</option>
              <option value="flat">Net flat</option>
            </SelectCombobox>
          </label>
        </div>
        {draftInvalid && (
          <p className="mt-2 text-xs" style={{ color: V3.red }}>
            From date must be before or equal to To date.
          </p>
        )}
      </CollapsedListFilters>

      {/* CASH-FLOW-01 (owner order 2026-09-06): honest coverage banner -- a $0 actual on 0
          categorized bank lines is "actuals unavailable", not "confirmed zero cash moved". */}
      {!isLoading && data && data.bank_categorization_coverage.categorized_count === 0 ? (
        <div
          className="rounded-sm px-3 py-2 text-xs"
          style={{ border: `1px solid ${V3.border}`, background: V3.headerBg, color: V3.ink }}
        >
          {data.bank_categorization_coverage.categorized_count} of {data.bank_categorization_coverage.total_count} bank
          lines categorized — actuals unavailable, not zero. Categorize transactions in Banking to see real actuals here.
        </div>
      ) : null}

      {/* ROUND 443.250 — V3 KPI strip (board: Income / Expense accuracy · Net variance · Days). */}
      {!isLoading && acc && (
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8 }}
          data-testid="cash-flow-avp-v3-kpis"
        >
          {(() => {
            const incomeVerb = accuracyVerb(
              acc.total_projected_income_cents,
              acc.total_actual_income_cents,
              !!actualsUnavailable,
            );
            return (
              <V3KpiTile
                label="Income accuracy"
                value={
                  actualsUnavailable
                    ? "unavailable"
                    : formatCents(acc.total_actual_income_cents - acc.total_projected_income_cents, { sign: true })
                }
                tone={incomeVerb.tone}
                sub={
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontWeight: 600, color: incomeVerb.accent }}>
                      {incomeVerb.text}
                    </span>
                    <span>
                      proj {formatCents(acc.total_projected_income_cents)} · act{" "}
                      {actualsUnavailable ? "unavailable" : formatCents(acc.total_actual_income_cents)}
                    </span>
                  </span>
                }
                testId="cash-flow-avp-v3-kpi-income"
              />
            );
          })()}
          {(() => {
            const expVerb = accuracyVerb(
              acc.total_projected_expense_cents,
              acc.total_actual_expense_cents,
              !!actualsUnavailable,
            );
            return (
              <V3KpiTile
                label="Expense accuracy"
                value={
                  actualsUnavailable
                    ? "unavailable"
                    : formatCents(acc.total_actual_expense_cents - acc.total_projected_expense_cents, { sign: true })
                }
                tone={expVerb.tone}
                sub={
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontWeight: 600, color: expVerb.accent }}>
                      {expVerb.text}
                    </span>
                    <span>
                      proj {formatCents(acc.total_projected_expense_cents)} · act{" "}
                      {actualsUnavailable ? "unavailable" : formatCents(acc.total_actual_expense_cents)}
                    </span>
                  </span>
                }
                testId="cash-flow-avp-v3-kpi-expense"
              />
            );
          })()}
          {(() => {
            const projNet = acc.total_projected_income_cents - acc.total_projected_expense_cents;
            const actNet = acc.total_actual_income_cents - acc.total_actual_expense_cents;
            const netVar = actNet - projNet;
            return (
              <V3KpiTile
                label="Net variance"
                value={actualsUnavailable ? "unavailable" : formatCents(netVar, { sign: true })}
                tone={actualsUnavailable ? "muted" : netVar < 0 ? "red" : netVar > 0 ? "green" : "ink"}
                sub={
                  <span>
                    proj net {formatCents(projNet, { sign: true })} · act net{" "}
                    {actualsUnavailable ? "unavailable" : formatCents(actNet, { sign: true })}
                  </span>
                }
                testId="cash-flow-avp-v3-kpi-net"
              />
            );
          })()}
          <V3KpiTile
            label="Days in range"
            value={shortRangeLabel(applied.from, applied.to)}
            sub={`${dayCountInclusive(applied.from, applied.to)} day${dayCountInclusive(applied.from, applied.to) === 1 ? "" : "s"}`}
            tone="muted"
            testId="cash-flow-avp-v3-kpi-days"
          />
        </div>
      )}

      {!isLoading && chartPoints.length > 0 && (
        <BoardSection
          title="Cumulative — projected vs actual"
          headerRight={
            <V3Segmented
              value={chartGrain}
              onChange={setChartGrain}
              options={[
                { id: "cumulative", label: "Cumulative" },
                { id: "daily", label: "Daily" },
              ]}
              testId="cash-flow-avp-chart-grain"
            />
          }
          testId="cash-flow-avp-chart-panel"
        >
          <AvpCompareChart points={chartPoints} grain={chartGrain} />
        </BoardSection>
      )}

      {/* Per-line table */}
      {isError ? (
        <ListErrorState
          title="Couldn't load actual vs projected data"
          status={0}
          message={(avpQ.error as Error)?.message}
          onRetry={() => void avpQ.refetch()}
        />
      ) : (
        <ParityTable
          title="Actual vs projected — by date"
          columns={COLUMNS}
          rows={filteredGroups}
          rowKey={(g) => g.date}
          loading={isLoading}
          emptyText="No data for the selected date range."
          storageKey="cash-flow-avp"
          tableTestId="cash-flow-avp-table"
        />
      )}
    </div>
  );
}
