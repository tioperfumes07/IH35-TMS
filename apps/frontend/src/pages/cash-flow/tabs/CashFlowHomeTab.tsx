import { useMemo, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRollingLedger, type RollingLedgerDay, type RollingLedgerResult } from "../../../api/cashFlow";
import { addDaysIso, companyToday } from "../../../lib/businessDate";
import { formatUsdCents } from "../../../lib/money";
import { V3 } from "../../../design/v3-tokens";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { BoardSection } from "../../../components/v3/BoardSection";
import { V3Segmented } from "../../../components/v3/V3Segmented";
import { CashFlowKpiStrip, formatCashFlowCents, type CashFlowKpis } from "./CashFlowKpiStrip";
import type { CashFlowTabId } from "../CashFlowPage";

// REG-031 — Cash Flow lands on Home with a real KPI strip + links into sibling tabs.
// ROUND 443.250 — V3 board layout (CashFlow-Home): KPI row + 4-week/13-week chart +
// 13-week table from the SAME live rolling-ledger endpoint. No invented board numbers.

/** 13 forecast weeks (+ a little headroom for week alignment). */
const HOME_WINDOW_DAYS = 98;

type WeekBucket = {
  weekStart: string;
  label: string;
  income_cents: number;
  expenses_cents: number;
  net_cents: number;
  ending_cash_cents: number | null;
};

function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0 = Sun
  const delta = dow === 0 ? -6 : 1 - dow;
  return addDaysIso(iso, delta);
}

function weekLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${m}-${d}`;
}

function formatCompactDollars(cents: number | null): string {
  if (cents === null) return "—";
  if (cents === 0) return "—";
  const neg = cents < 0;
  const dollars = Math.round(Math.abs(cents) / 100);
  const body = dollars.toLocaleString("en-US");
  return neg ? `-${body}` : body;
}

function computeHomeKpis(data: RollingLedgerResult, today: string): CashFlowKpis {
  const todayDay = data.days.find((d) => d.date === today) ?? data.days[0];
  const rows = data.rows;
  const incomeNotFactored = rows.filter((r) => r.type === "Invoice").reduce((s, r) => s + r.amount_cents, 0);
  const dueNext10 = rows
    .filter((r) => r.row_kind === "income" && r.due_date >= today && r.due_date <= addDaysIso(today, 10))
    .reduce((s, r) => s + r.amount_cents, 0);
  return {
    opening: data.opening_cash_cents,
    incomeToday: todayDay?.income_due_cents ?? 0,
    expensesToday: todayDay?.expenses_due_cents ?? 0,
    carriedOver: (todayDay?.income_carry_over_cents ?? 0) + (todayDay?.expenses_carry_over_cents ?? 0),
    netToday: todayDay?.net_cents ?? 0,
    projectedClosing: todayDay?.running_cash_cents ?? null,
    incomeNotFactored,
    dueNext10,
  };
}

function buildWeekBuckets(days: RollingLedgerDay[], today: string, weekCount: number): WeekBucket[] {
  const start = mondayOf(today);
  const weeks: WeekBucket[] = [];
  for (let i = 0; i < weekCount; i++) {
    const weekStart = addDaysIso(start, i * 7);
    const weekEnd = addDaysIso(weekStart, 6);
    const inWeek = days.filter((d) => d.date >= weekStart && d.date <= weekEnd);
    const income_cents = inWeek.reduce((s, d) => s + d.income_due_cents, 0);
    const expenses_cents = inWeek.reduce((s, d) => s + d.expenses_due_cents, 0);
    const lastWithCash = [...inWeek].reverse().find((d) => d.running_cash_cents !== null);
    weeks.push({
      weekStart,
      label: weekLabel(weekStart),
      income_cents,
      expenses_cents,
      net_cents: income_cents - expenses_cents,
      ending_cash_cents: lastWithCash?.running_cash_cents ?? null,
    });
  }
  return weeks;
}

function sparkPoints(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = values.length === 1 ? width / 2 : (i / (values.length - 1)) * width;
      const y = height - ((v - min) / span) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

type TabLinkCard = {
  id: Exclude<CashFlowTabId, "home">;
  label: string;
  description: string;
};

const TAB_CARDS: TabLinkCard[] = [
  { id: "daily_prediction", label: "Projected (Auto)", description: "Today's automatic income and expense projection." },
  { id: "actual_vs_projected", label: "Actual vs Projected", description: "Compare what actually cleared against what was projected." },
  { id: "rolling_ledger", label: "Rolling Ledger", description: "The full day-by-day expected income and expense register, with roll-over." },
  { id: "manual_daily_projections", label: "Manual Daily Projections", description: "Hand-entered daily projections, when enabled." },
];

function CashPositionChart({ weeks, openingCents }: { weeks: WeekBucket[]; openingCents: number | null }) {
  const W = 1300;
  const H = 330;
  const left = 64;
  const right = 1284;
  const top = 26;
  const zeroY = 237.2;
  const plotW = right - left;
  const maxAbs = Math.max(
    1,
    ...weeks.map((w) => Math.abs(w.income_cents)),
    ...weeks.map((w) => Math.abs(w.expenses_cents)),
    ...weeks.map((w) => Math.abs(w.ending_cash_cents ?? 0)),
  );
  const scale = (cents: number) => (Math.abs(cents) / maxAbs) * (zeroY - top);
  const n = Math.max(weeks.length, 1);
  const slot = plotW / n;
  const barW = Math.min(20.1, slot * 0.28);

  const balancePts = weeks
    .map((w, i) => {
      const cx = left + slot * i + slot / 2;
      const cash = w.ending_cash_cents ?? 0;
      const y = cash >= 0 ? zeroY - scale(cash) : zeroY + scale(cash);
      return `${cx.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const tickCents = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxAbs * t));

  return (
    <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 16, fontSize: 11, color: V3.muted }}>
        <span>
          <span style={{ display: "inline-block", width: 9, height: 9, background: V3.dataMid, marginRight: 4 }} />
          Receipts
        </span>
        <span>
          <span style={{ display: "inline-block", width: 9, height: 9, background: V3.slateLt, marginRight: 4 }} />
          Disbursements
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 14,
              height: 2,
              background: V3.ink,
              verticalAlign: "middle",
              marginRight: 4,
            }}
          />
          Projected bank balance
          {openingCents !== null ? ` (opening ${formatUsdCents(openingCents)})` : ""}
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} data-testid="cash-flow-home-chart-svg">
        {tickCents.map((cents) => {
          const y = zeroY - (cents / maxAbs) * (zeroY - top);
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
        <text x={left + 6} y={top + 12} fontFamily={V3.font} fontSize={10} fontWeight={600} fill={V3.data}>
          FORECAST · {weeks.length} WEEKS
        </text>
        {weeks.map((w, i) => {
          const cx = left + slot * i + slot / 2;
          const inH = scale(w.income_cents);
          const outH = scale(w.expenses_cents);
          const inY = zeroY - inH;
          const outY = zeroY - outH;
          return (
            <g key={w.weekStart}>
              <rect
                className="cf-v3-grow"
                style={{ animationDelay: `${i * 0.04}s` }}
                x={cx - barW - 1}
                y={inY}
                width={barW}
                height={Math.max(inH, 0)}
                fill={V3.dataMid}
              />
              <rect
                className="cf-v3-grow"
                style={{ animationDelay: `${i * 0.04}s` }}
                x={cx + 1}
                y={outY}
                width={barW}
                height={Math.max(outH, 0)}
                fill={V3.slateLt}
              />
              <text x={cx} y={306} textAnchor="middle" fontFamily={V3.font} fontSize={10} fill={V3.muted}>
                {w.label}
              </text>
            </g>
          );
        })}
        {balancePts ? (
          <polyline
            className="cf-v3-draw"
            pathLength={1}
            points={balancePts}
            fill="none"
            stroke={V3.ink}
            strokeWidth={2.2}
          />
        ) : null}
      </svg>
      <style>{`
        @keyframes cf-v3-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        @keyframes cf-v3-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        .cf-v3-grow { transform-box: fill-box; transform-origin: bottom; animation: cf-v3-grow .9s cubic-bezier(.2,.8,.2,1) both; }
        .cf-v3-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: cf-v3-draw 1.6s ease-out .2s forwards; }
      `}</style>
    </div>
  );
}

function ThirteenWeekTable({
  weeks,
  unit,
}: {
  weeks: WeekBucket[];
  unit: "dollars" | "pct";
}) {
  const totalIncome = weeks.reduce((s, w) => s + w.income_cents, 0) || 1;
  const totalExpense = weeks.reduce((s, w) => s + w.expenses_cents, 0) || 1;

  const cell = (cents: number, ofTotal: number) => {
    if (unit === "pct") {
      if (cents === 0) return "—";
      return `${((cents / ofTotal) * 100).toFixed(0)}%`;
    }
    return formatCompactDollars(cents);
  };

  const th: CSSProperties = {
    textAlign: "right",
    font: `600 11px ${V3.font}`,
    color: V3.muted,
    padding: "7px 12px",
    borderBottom: `1px solid ${V3.border}`,
    background: V3.headerBg,
    whiteSpace: "nowrap",
  };
  const td: CSSProperties = {
    textAlign: "right",
    padding: "7px 12px",
    borderBottom: `1px solid ${V3.borderSoft}`,
    fontSize: 12,
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
    fontFamily: V3.font,
    color: V3.ink,
  };
  const group: CSSProperties = {
    padding: "7px 12px",
    background: V3.band,
    font: `700 11px ${V3.font}`,
    letterSpacing: ".04em",
    textTransform: "uppercase",
    color: V3.ink,
    borderBottom: `1px solid ${V3.borderSoft}`,
  };

  return (
    <div style={{ overflowX: "auto" }} data-testid="cash-flow-home-13w-table">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }} />
            {weeks.map((w) => (
              <th key={w.weekStart} style={th}>
                {w.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={weeks.length + 1} style={group}>
              Receipts
            </td>
          </tr>
          <tr>
            <td style={{ ...td, textAlign: "left" }}>
              <b>Total receipts</b>
            </td>
            {weeks.map((w) => (
              <td key={w.weekStart} style={td}>
                <b>{cell(w.income_cents, totalIncome)}</b>
              </td>
            ))}
          </tr>
          <tr>
            <td colSpan={weeks.length + 1} style={group}>
              Disbursements
            </td>
          </tr>
          <tr>
            <td style={{ ...td, textAlign: "left" }}>
              <b>Total disbursements</b>
            </td>
            {weeks.map((w) => (
              <td key={w.weekStart} style={td}>
                <b>{cell(w.expenses_cents, totalExpense)}</b>
              </td>
            ))}
          </tr>
          <tr>
            <td colSpan={weeks.length + 1} style={group}>
              Position
            </td>
          </tr>
          <tr>
            <td style={{ ...td, textAlign: "left" }}>
              <b>Net cash flow</b>
            </td>
            {weeks.map((w) => (
              <td
                key={w.weekStart}
                style={{
                  ...td,
                  color: w.net_cents < 0 ? V3.red : w.net_cents > 0 ? V3.green : V3.ink,
                  fontWeight: 700,
                }}
              >
                {unit === "pct" ? cell(Math.abs(w.net_cents), totalIncome) : formatCompactDollars(w.net_cents)}
              </td>
            ))}
          </tr>
          <tr>
            <td style={{ ...td, textAlign: "left" }}>
              <b>Ending balance</b>
            </td>
            {weeks.map((w) => {
              const c = w.ending_cash_cents;
              return (
                <td
                  key={w.weekStart}
                  style={{
                    ...td,
                    color: c !== null && c < 0 ? V3.red : c !== null && c > 0 ? V3.green : V3.ink,
                    fontWeight: 700,
                  }}
                >
                  {c === null ? "—" : formatCompactDollars(c)}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function CashFlowHomeTab({
  operatingCompanyId,
  onNavigateToTab,
  showManualProjections,
}: {
  operatingCompanyId: string;
  onNavigateToTab: (tab: Exclude<CashFlowTabId, "home">) => void;
  showManualProjections: boolean;
}) {
  const today = companyToday();
  const windowEnd = useMemo(() => addDaysIso(today, HOME_WINDOW_DAYS), [today]);
  const [chartGrain, setChartGrain] = useState<"weekly" | "monthly">("weekly");
  const [tableUnit, setTableUnit] = useState<"dollars" | "pct">("dollars");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["cash-flow-home-kpis", operatingCompanyId, today, windowEnd],
    queryFn: () => getRollingLedger(operatingCompanyId, today, windowEnd),
    enabled: Boolean(operatingCompanyId),
  });

  const kpis = useMemo(() => (data ? computeHomeKpis(data, today) : null), [data, today]);
  const weeks = useMemo(() => (data ? buildWeekBuckets(data.days, today, 13) : []), [data, today]);
  const cards = TAB_CARDS.filter((c) => c.id !== "manual_daily_projections" || showManualProjections);

  const next4WeeksIn = useMemo(() => {
    if (!data) return 0;
    const end = addDaysIso(today, 27);
    return data.days
      .filter((d) => d.date >= today && d.date <= end)
      .reduce((s, d) => s + d.income_due_cents, 0);
  }, [data, today]);

  const weeklyRunRate = useMemo(() => {
    if (weeks.length === 0) return 0;
    const withActivity = weeks.filter((w) => w.income_cents !== 0 || w.expenses_cents !== 0);
    const src = withActivity.length ? withActivity : weeks;
    return Math.round(src.reduce((s, w) => s + w.net_cents, 0) / src.length);
  }, [weeks]);

  const lowest = useMemo(() => {
    let min: { cents: number; label: string } | null = null;
    for (const w of weeks) {
      if (w.ending_cash_cents === null) continue;
      if (min === null || w.ending_cash_cents < min.cents) {
        min = { cents: w.ending_cash_cents, label: `wk ${w.label}` };
      }
    }
    return min;
  }, [weeks]);

  const incomeSpark = useMemo(() => sparkPoints(weeks.slice(0, 4).map((w) => w.income_cents), 96, 26), [weeks]);
  const runRateSpark = useMemo(() => sparkPoints(weeks.slice(0, 4).map((w) => w.net_cents), 96, 26), [weeks]);

  const todayIncomeCount = useMemo(() => {
    if (!data) return 0;
    return data.rows.filter((r) => r.row_kind === "income" && r.due_date === today && !r.is_rollover_echo).length;
  }, [data, today]);

  const todayExpenseCount = useMemo(() => {
    if (!data) return 0;
    return data.rows.filter((r) => r.row_kind === "expense" && r.due_date === today && !r.is_rollover_echo).length;
  }, [data, today]);

  return (
    <div className="space-y-3" data-testid="cash-flow-home-tab" style={{ fontFamily: V3.font }}>
      {isError && (
        <div
          className="rounded-sm p-6 text-center text-xs"
          style={{ border: `1px solid ${V3.border}`, background: V3.headerBg, color: V3.ink }}
        >
          Failed to load today's cash position. Please try again.
        </div>
      )}

      {isLoading && !data && (
        <div
          className="rounded-sm p-6 text-center text-xs"
          style={{ border: `1px solid ${V3.border}`, background: V3.surface, color: V3.muted }}
        >
          Loading…
        </div>
      )}

      {/* REG-031: keep shared strip so Rolling Ledger + Home stay one KPI component. */}
      {kpis && <CashFlowKpiStrip kpis={kpis} testId="cash-flow-home-kpi-strip" />}

      {kpis && (
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8 }}
          data-testid="cash-flow-home-v3-kpis"
        >
          <V3KpiTile
            label="Opening cash"
            value={kpis.opening === null ? "—" : formatUsdCents(kpis.opening)}
            sub="live · as shown in the app today"
            testId="cash-flow-home-v3-kpi-opening"
            onClick={() => onNavigateToTab("rolling_ledger")}
          />
          <V3KpiTile
            label="Income due today"
            value={formatUsdCents(kpis.incomeToday)}
            sub={`${todayIncomeCount} item${todayIncomeCount === 1 ? "" : "s"}`}
            testId="cash-flow-home-v3-kpi-income"
            onClick={() => onNavigateToTab("daily_prediction")}
          />
          <V3KpiTile
            label="Expenses due today"
            value={formatUsdCents(kpis.expensesToday)}
            sub={`${todayExpenseCount} item${todayExpenseCount === 1 ? "" : "s"}`}
            testId="cash-flow-home-v3-kpi-expenses"
            onClick={() => onNavigateToTab("daily_prediction")}
          />
          <V3KpiTile
            label="Next 4 weeks in"
            value={formatUsdCents(next4WeeksIn)}
            sub="committed invoices"
            spark={
              incomeSpark ? (
                <svg width={96} height={26} viewBox="0 0 96 26" aria-hidden>
                  <polyline
                    className="cf-v3-draw"
                    pathLength={1}
                    points={incomeSpark}
                    fill="none"
                    stroke={V3.data}
                    strokeWidth={1.6}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
              ) : undefined
            }
            testId="cash-flow-home-v3-kpi-4w"
            onClick={() => onNavigateToTab("rolling_ledger")}
          />
          <V3KpiTile
            label="Weekly run-rate"
            value={formatCashFlowCents(weeklyRunRate, { sign: true })}
            tone={weeklyRunRate < 0 ? "red" : weeklyRunRate > 0 ? "green" : "ink"}
            sub={
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontWeight: 600, color: weeklyRunRate < 0 ? V3.red : V3.green }}>
                  {weeklyRunRate < 0 ? "▼ out > in" : weeklyRunRate > 0 ? "▲ in > out" : "flat"}
                </span>
                <span>forecast weeks</span>
              </span>
            }
            spark={
              runRateSpark ? (
                <svg width={96} height={26} viewBox="0 0 96 26" aria-hidden>
                  <polyline
                    className="cf-v3-draw"
                    pathLength={1}
                    points={runRateSpark}
                    fill="none"
                    stroke={V3.data}
                    strokeWidth={1.6}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
              ) : undefined
            }
            testId="cash-flow-home-v3-kpi-runrate"
            onClick={() => onNavigateToTab("rolling_ledger")}
          />
          <V3KpiTile
            label="Lowest balance"
            value={lowest ? formatCashFlowCents(lowest.cents, { sign: true }) : "—"}
            tone={lowest && lowest.cents < 0 ? "red" : "ink"}
            sub={lowest?.label ?? "no projected days"}
            testId="cash-flow-home-v3-kpi-lowest"
            onClick={() => onNavigateToTab("rolling_ledger")}
          />
        </div>
      )}

      {weeks.length > 0 && (
        <BoardSection
          title="Cash position — forecast weeks"
          subtitle="from live rolling ledger"
          onViewAll={() => onNavigateToTab("rolling_ledger")}
          headerRight={
            <V3Segmented
              value={chartGrain}
              onChange={setChartGrain}
              options={[
                { id: "weekly", label: "Weekly" },
                { id: "monthly", label: "Monthly" },
              ]}
              testId="cash-flow-home-chart-grain"
            />
          }
          testId="cash-flow-home-chart-panel"
        >
          <CashPositionChart
            weeks={chartGrain === "weekly" ? weeks : weeks.filter((_, i) => i % 4 === 0)}
            openingCents={data?.opening_cash_cents ?? null}
          />
        </BoardSection>
      )}

      {weeks.length > 0 && (
        <BoardSection
          title="13-week cash flow"
          onViewAll={() => onNavigateToTab("rolling_ledger")}
          headerRight={
            <V3Segmented
              value={tableUnit}
              onChange={setTableUnit}
              options={[
                { id: "dollars", label: "$" },
                { id: "pct", label: "%" },
              ]}
              testId="cash-flow-home-table-unit"
            />
          }
          footer="Black = committed documents from the rolling ledger · every total opens the ledger."
          testId="cash-flow-home-table-panel"
        >
          <ThirteenWeekTable weeks={weeks} unit={tableUnit} />
        </BoardSection>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="cash-flow-home-tab-cards">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onNavigateToTab(card.id)}
            className="rounded-sm p-3 text-left transition"
            style={{
              border: `1px solid ${V3.border}`,
              background: V3.surface,
              fontFamily: V3.font,
            }}
            data-testid={`cash-flow-home-card-${card.id}`}
          >
            <div className="text-xs font-bold uppercase tracking-wide" style={{ color: V3.ink }}>
              {card.label}
            </div>
            <div className="mt-1 text-xs" style={{ color: V3.muted }}>
              {card.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
