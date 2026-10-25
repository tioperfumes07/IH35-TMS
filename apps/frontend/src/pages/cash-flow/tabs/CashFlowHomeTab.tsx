import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getActualVsProjected,
  getRollingLedger,
  type RollingLedgerResult,
  type RollingLedgerRow,
} from "../../../api/cashFlow";
import { addDaysIso, companyToday } from "../../../lib/businessDate";
import { formatUsdCents } from "../../../lib/money";
import { V3 } from "../../../design/v3-tokens";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { BoardSection } from "../../../components/v3/BoardSection";
import { V3Segmented } from "../../../components/v3/V3Segmented";
import { formatCashFlowCents } from "./CashFlowKpiStrip";
import type { CashFlowTabId } from "../CashFlowPage";

// ROUND 443.280-A #7 — Cash Flow Home board (docs/design/v3/CashFlow-Home):
// V3KpiTile strip ONLY (no layered CashFlowKpiStrip), no tab-card-theater theater,
// category 13-week table (grey = run-rate · black = committed), real monthly grain,
// chart = 4 weeks actual (bank) + 13 weeks forecast, Base|Conservative.
// Engine: getRollingLedger (+ getActualVsProjected for ACTUAL bars / run-rate seed).
// LEAD LOCK: weekly run-rate KPI formula below is unchanged (forecast-week average).

const FORECAST_WEEKS = 13;
const ACTUAL_WEEKS = 4;
const HOME_FORECAST_DAYS = FORECAST_WEEKS * 7 + 6;

type Scenario = "base" | "conservative";
type ChartGrain = "weekly" | "monthly";
type TableUnit = "dollars" | "pct";

type WeekBucket = {
  weekStart: string;
  label: string;
  kind: "actual" | "forecast";
  invoice_cents: number;
  topup_cents: number;
  finance_cents: number;
  driver_cents: number;
  diesel_cents: number;
  vendor_cents: number;
  other_cents: number;
  income_cents: number;
  expenses_cents: number;
  net_cents: number;
  ending_cash_cents: number | null;
  /** true when driver/diesel/other/topup cells are run-rate estimates (grey). */
  driver_run_rate: boolean;
  diesel_run_rate: boolean;
  other_run_rate: boolean;
  topup_run_rate: boolean;
};

type MonthBucket = {
  monthStart: string;
  label: string;
  kind: "actual" | "forecast";
  invoice_cents: number;
  topup_cents: number;
  finance_cents: number;
  driver_cents: number;
  diesel_cents: number;
  vendor_cents: number;
  other_cents: number;
  income_cents: number;
  expenses_cents: number;
  net_cents: number;
  ending_cash_cents: number | null;
  driver_run_rate: boolean;
  diesel_run_rate: boolean;
  other_run_rate: boolean;
  topup_run_rate: boolean;
};

function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  return addDaysIso(iso, delta);
}

function weekLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${m}-${d}`;
}

function monthLabel(iso: string): string {
  const [y, m] = iso.split("-");
  return `${m}/${y.slice(2)}`;
}

function formatCompactDollars(cents: number | null): string {
  if (cents === null || cents === 0) return "—";
  const neg = cents < 0;
  const dollars = Math.round(Math.abs(cents) / 100);
  const body = dollars.toLocaleString("en-US");
  return neg ? `-${body}` : body;
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

function isInvoiceIncome(row: RollingLedgerRow): boolean {
  return (
    row.row_kind === "income" &&
    (row.document_kind === "invoice" ||
      row.document_kind === "load" ||
      row.document_kind === "factoring_advance" ||
      row.type === "Invoice" ||
      /invoice|load|factor/i.test(row.type))
  );
}

type ExpenseBucket = "finance" | "driver" | "diesel" | "vendor" | "other";

function expenseBucket(row: RollingLedgerRow): ExpenseBucket {
  if (row.row_kind !== "expense") return "other";
  const t = `${row.type} ${row.document_kind} ${row.document_label} ${row.counterparty}`.toLowerCase();
  if (
    row.document_kind === "loan_amortization_row" ||
    /loan|lease|amort|note|rent|finance/.test(t)
  ) {
    return "finance";
  }
  if (
    row.document_kind === "driver_bill" ||
    row.document_kind === "settlement" ||
    /driver|settlement/.test(t)
  ) {
    return "driver";
  }
  if (
    /fuel \(projected\)|fuel est|diesel|fuel|relay|card fill|card_payable/.test(t) ||
    row.document_kind === "card_payable" ||
    row.document_kind === "relay_topup" ||
    /^fuel-avg-/.test(row.document_id)
  ) {
    return "diesel";
  }
  if (row.document_kind === "bill" || row.type === "Bill") return "vendor";
  return "other";
}

function rowsInWeek(rows: RollingLedgerRow[], weekStart: string): RollingLedgerRow[] {
  const weekEnd = addDaysIso(weekStart, 6);
  return rows.filter((r) => !r.is_rollover_echo && r.due_date >= weekStart && r.due_date <= weekEnd);
}

function sumCents(rows: RollingLedgerRow[]): number {
  return rows.reduce((s, r) => s + r.amount_cents, 0);
}

function avgPositive(values: number[]): number {
  const src = values.filter((v) => v > 0);
  if (src.length === 0) return 0;
  return Math.round(src.reduce((s, v) => s + v, 0) / src.length);
}

function buildForecastWeeks(
  data: RollingLedgerResult,
  today: string,
  scenario: Scenario,
  incomeRunRate: number,
  driverRunRate: number,
  dieselRunRate: number,
  otherRunRate: number,
): WeekBucket[] {
  const start = mondayOf(today);
  const weeks: WeekBucket[] = [];
  let running = data.opening_cash_cents;

  for (let i = 0; i < FORECAST_WEEKS; i++) {
    const weekStart = addDaysIso(start, i * 7);
    const inWeek = rowsInWeek(data.rows, weekStart);
    const invoices = sumCents(inWeek.filter(isInvoiceIncome));
    const finance = sumCents(inWeek.filter((r) => expenseBucket(r) === "finance"));
    const driverCommitted = sumCents(inWeek.filter((r) => expenseBucket(r) === "driver"));
    const dieselCommitted = sumCents(inWeek.filter((r) => expenseBucket(r) === "diesel"));
    const vendor = sumCents(inWeek.filter((r) => expenseBucket(r) === "vendor"));
    const otherCommitted = sumCents(inWeek.filter((r) => expenseBucket(r) === "other"));

    const useRunRate = scenario === "base";
    const topup = useRunRate ? Math.max(0, incomeRunRate - invoices) : 0;
    const driver = useRunRate ? (driverRunRate > 0 ? driverRunRate : driverCommitted) : driverCommitted;
    const diesel = useRunRate ? (dieselRunRate > 0 ? dieselRunRate : dieselCommitted) : 0;
    const other = useRunRate ? (otherRunRate > 0 ? otherRunRate : otherCommitted) : otherCommitted;

    const income_cents = invoices + topup;
    const expenses_cents = finance + driver + diesel + vendor + other;
    const net_cents = income_cents - expenses_cents;
    if (running !== null) running += net_cents;

    weeks.push({
      weekStart,
      label: weekLabel(weekStart),
      kind: "forecast",
      invoice_cents: invoices,
      topup_cents: topup,
      finance_cents: finance,
      driver_cents: driver,
      diesel_cents: diesel,
      vendor_cents: vendor,
      other_cents: other,
      income_cents,
      expenses_cents,
      net_cents,
      ending_cash_cents: running,
      driver_run_rate: useRunRate && driverRunRate > 0,
      diesel_run_rate: useRunRate && dieselRunRate > 0,
      other_run_rate: useRunRate && otherRunRate > 0,
      topup_run_rate: topup > 0,
    });
  }
  return weeks;
}

function buildActualWeeks(
  avpLines: { date: string; category: string; actual_cents: number; actual_unavailable?: boolean }[],
  today: string,
): WeekBucket[] {
  const forecastMonday = mondayOf(today);
  const firstActualMonday = addDaysIso(forecastMonday, -ACTUAL_WEEKS * 7);
  const weeks: WeekBucket[] = [];
  for (let i = 0; i < ACTUAL_WEEKS; i++) {
    const weekStart = addDaysIso(firstActualMonday, i * 7);
    const weekEnd = addDaysIso(weekStart, 6);
    const dayLines = avpLines.filter((l) => l.date >= weekStart && l.date <= weekEnd && !l.actual_unavailable);
    const income = dayLines.filter((l) => l.category === "income").reduce((s, l) => s + l.actual_cents, 0);
    const expenses = dayLines.filter((l) => l.category === "expenses").reduce((s, l) => s + l.actual_cents, 0);
    weeks.push({
      weekStart,
      label: weekLabel(weekStart),
      kind: "actual",
      invoice_cents: income,
      topup_cents: 0,
      finance_cents: 0,
      driver_cents: 0,
      diesel_cents: 0,
      vendor_cents: 0,
      other_cents: expenses,
      income_cents: income,
      expenses_cents: expenses,
      net_cents: income - expenses,
      ending_cash_cents: null,
      driver_run_rate: false,
      diesel_run_rate: false,
      other_run_rate: false,
      topup_run_rate: false,
    });
  }
  return weeks;
}

function buildMonthBuckets(weeks: WeekBucket[]): MonthBucket[] {
  const map = new Map<string, WeekBucket[]>();
  for (const w of weeks) {
    const key = w.weekStart.slice(0, 7) + "-01";
    const list = map.get(key) ?? [];
    list.push(w);
    map.set(key, list);
  }
  const months: MonthBucket[] = [];
  for (const [monthStart, group] of [...map.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const last = group[group.length - 1];
    months.push({
      monthStart,
      label: monthLabel(monthStart),
      kind: group.every((g) => g.kind === "actual") ? "actual" : "forecast",
      invoice_cents: group.reduce((s, g) => s + g.invoice_cents, 0),
      topup_cents: group.reduce((s, g) => s + g.topup_cents, 0),
      finance_cents: group.reduce((s, g) => s + g.finance_cents, 0),
      driver_cents: group.reduce((s, g) => s + g.driver_cents, 0),
      diesel_cents: group.reduce((s, g) => s + g.diesel_cents, 0),
      vendor_cents: group.reduce((s, g) => s + g.vendor_cents, 0),
      other_cents: group.reduce((s, g) => s + g.other_cents, 0),
      income_cents: group.reduce((s, g) => s + g.income_cents, 0),
      expenses_cents: group.reduce((s, g) => s + g.expenses_cents, 0),
      net_cents: group.reduce((s, g) => s + g.net_cents, 0),
      ending_cash_cents: last.ending_cash_cents,
      driver_run_rate: group.some((g) => g.driver_run_rate),
      diesel_run_rate: group.some((g) => g.diesel_run_rate),
      other_run_rate: group.some((g) => g.other_run_rate),
      topup_run_rate: group.some((g) => g.topup_run_rate),
    });
  }
  return months;
}

function CashPositionChart({
  actualWeeks,
  forecastWeeks,
  openingCents,
  lowest,
}: {
  actualWeeks: WeekBucket[];
  forecastWeeks: WeekBucket[];
  openingCents: number | null;
  lowest: { cents: number; label: string } | null;
}) {
  const weeks = [...actualWeeks, ...forecastWeeks];
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
    ...forecastWeeks.map((w) => Math.abs(w.ending_cash_cents ?? 0)),
  );
  const scale = (cents: number) => (Math.abs(cents) / maxAbs) * (zeroY - top);
  const n = Math.max(weeks.length, 1);
  const slot = plotW / n;
  const barW = Math.min(20.1, slot * 0.28);
  const actualCount = actualWeeks.length;
  const splitX = left + slot * actualCount;

  const balancePts = forecastWeeks
    .map((w, i) => {
      const idx = actualCount + i;
      const cx = left + slot * idx + slot / 2;
      const cash = w.ending_cash_cents ?? 0;
      const y = cash >= 0 ? zeroY - scale(cash) : zeroY + scale(cash);
      return { cx, y, cash, label: w.label, isLowest: lowest !== null && cash === lowest.cents };
    });

  const tickCents = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxAbs * t));
  const poly = balancePts.map((p) => `${p.cx.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

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
        <rect x={left} y={top} width={Math.max(splitX - left, 0)} height={zeroY - top + 53} fill={V3.chartBand} />
        <text x={left + 6} y={top + 12} fontFamily={V3.font} fontSize={10} fontWeight={600} fill={V3.muted}>
          ACTUAL
        </text>
        <text x={splitX + 6} y={top + 12} fontFamily={V3.font} fontSize={10} fontWeight={600} fill={V3.data}>
          FORECAST · {forecastWeeks.length} WEEKS
        </text>
        <line x1={splitX} x2={splitX} y1={top} y2={zeroY + 53} stroke={V3.data} strokeDasharray="3 4" />
        {weeks.map((w, i) => {
          const cx = left + slot * i + slot / 2;
          const inH = scale(w.income_cents);
          const outH = scale(w.expenses_cents);
          const inFill = w.kind === "actual" ? V3.data : V3.dataMid;
          return (
            <g key={`${w.kind}-${w.weekStart}`}>
              <rect
                className="cf-v3-grow"
                style={{ animationDelay: `${i * 0.04}s` }}
                x={cx - barW - 1}
                y={zeroY - inH}
                width={barW}
                height={Math.max(inH, 0)}
                fill={inFill}
              />
              <rect
                className="cf-v3-grow"
                style={{ animationDelay: `${i * 0.04}s` }}
                x={cx + 1}
                y={zeroY - outH}
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
        {poly ? (
          <polyline className="cf-v3-draw" pathLength={1} points={poly} fill="none" stroke={V3.ink} strokeWidth={2.2} />
        ) : null}
        {balancePts.map((p) => (
          <circle
            key={p.label}
            cx={p.cx}
            cy={p.y}
            r={p.isLowest ? 4.5 : 3}
            fill={p.isLowest ? V3.red : "#fff"}
            stroke={p.isLowest ? V3.red : V3.ink}
            strokeWidth={1.6}
          />
        ))}
        {lowest && balancePts.length > 0 ? (
          <text
            x={balancePts[balancePts.length - 1].cx - 8}
            y={Math.min(balancePts[balancePts.length - 1].y + 20, 280)}
            textAnchor="end"
            fontFamily={V3.font}
            fontSize={11}
            fontWeight={700}
            fill={V3.red}
          >
            Lowest balance {formatCompactDollars(lowest.cents)} · wk {lowest.label.replace(/^wk\s*/, "")}
          </text>
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

function Cell({
  cents,
  ofTotal,
  unit,
  grey,
  onClick,
}: {
  cents: number;
  ofTotal: number;
  unit: TableUnit;
  grey?: boolean;
  onClick?: () => void;
}) {
  let text: string;
  if (unit === "pct") {
    text = cents === 0 ? "—" : `${((cents / (ofTotal || 1)) * 100).toFixed(0)}%`;
  } else {
    text = formatCompactDollars(cents);
  }
  const style: CSSProperties = {
    textAlign: "right",
    padding: "7px 12px",
    borderBottom: `1px solid ${V3.borderSoft}`,
    fontSize: 12,
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
    fontFamily: V3.font,
    color: grey ? V3.mutedSoft : V3.ink,
    cursor: onClick ? "pointer" : undefined,
    background: "transparent",
    border: "none",
    width: "100%",
  };
  if (onClick) {
    return (
      <td style={{ padding: 0, borderBottom: `1px solid ${V3.borderSoft}` }}>
        <button type="button" onClick={onClick} style={style} title="Open rolling ledger">
          {text}
        </button>
      </td>
    );
  }
  return <td style={style}>{text}</td>;
}

function ThirteenWeekTable({
  columns,
  unit,
  onOpen,
}: {
  columns: Array<WeekBucket | MonthBucket>;
  unit: TableUnit;
  onOpen: (tab: Exclude<CashFlowTabId, "home">) => void;
}) {
  const totalIncome = columns.reduce((s, w) => s + w.income_cents, 0) || 1;
  const totalExpense = columns.reduce((s, w) => s + w.expenses_cents, 0) || 1;

  const th: CSSProperties = {
    textAlign: "right",
    font: `600 11px ${V3.font}`,
    color: V3.muted,
    padding: "7px 12px",
    borderBottom: `1px solid ${V3.border}`,
    background: V3.headerBg,
    whiteSpace: "nowrap",
  };
  const tdLabel: CSSProperties = {
    textAlign: "left",
    padding: "7px 12px",
    borderBottom: `1px solid ${V3.borderSoft}`,
    fontSize: 12,
    whiteSpace: "nowrap",
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

  const row = (
    label: ReactNode,
    pick: (w: WeekBucket | MonthBucket) => number,
    opts?: { grey?: (w: WeekBucket | MonthBucket) => boolean; bold?: boolean; of?: number; tone?: boolean },
  ) => (
    <tr>
      <td style={{ ...tdLabel, fontWeight: opts?.bold ? 700 : 400, color: opts?.grey?.(columns[0]) ? V3.mutedSoft : V3.ink }}>
        {label}
      </td>
      {columns.map((w) => {
        const cents = pick(w);
        if (opts?.tone) {
          const color = cents < 0 ? V3.red : cents > 0 ? V3.green : V3.ink;
          return (
            <td
              key={"weekStart" in w ? w.weekStart : w.monthStart}
              style={{
                textAlign: "right",
                padding: "7px 12px",
                borderBottom: `1px solid ${V3.borderSoft}`,
                fontSize: 12,
                whiteSpace: "nowrap",
                fontVariantNumeric: "tabular-nums",
                fontFamily: V3.font,
                fontWeight: 700,
                color,
                cursor: "pointer",
              }}
              onClick={() => onOpen("rolling_ledger")}
            >
              {unit === "pct" ? (cents === 0 ? "—" : `${((Math.abs(cents) / totalIncome) * 100).toFixed(0)}%`) : formatCompactDollars(cents)}
            </td>
          );
        }
        return (
          <Cell
            key={"weekStart" in w ? w.weekStart : w.monthStart}
            cents={cents}
            ofTotal={opts?.of ?? totalIncome}
            unit={unit}
            grey={opts?.grey?.(w)}
            onClick={() => onOpen(opts?.of === totalExpense ? "daily_prediction" : "rolling_ledger")}
          />
        );
      })}
    </tr>
  );

  return (
    <div style={{ overflowX: "auto" }} data-testid="cash-flow-home-13w-table">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }} />
            {columns.map((w) => (
              <th key={"weekStart" in w ? w.weekStart : w.monthStart} style={th}>
                {w.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={columns.length + 1} style={group}>
              Receipts
            </td>
          </tr>
          {row("Customer invoices due", (w) => w.invoice_cents)}
          {row(<span style={{ color: V3.mutedSoft }}>Run-rate top-up</span>, (w) => w.topup_cents, {
            grey: (w) => w.topup_run_rate || w.topup_cents > 0,
          })}
          {row(<b>Total receipts</b>, (w) => w.income_cents, { bold: true })}
          <tr>
            <td colSpan={columns.length + 1} style={group}>
              Disbursements
            </td>
          </tr>
          {row("Finance & lease payments", (w) => w.finance_cents, { of: totalExpense })}
          {row("Driver pay (run-rate)", (w) => w.driver_cents, {
            of: totalExpense,
            grey: (w) => w.driver_run_rate,
          })}
          {row("Diesel (run-rate)", (w) => w.diesel_cents, {
            of: totalExpense,
            grey: (w) => w.diesel_run_rate,
          })}
          {row("Vendor bills due", (w) => w.vendor_cents, { of: totalExpense })}
          {row("Other operating (run-rate)", (w) => w.other_cents, {
            of: totalExpense,
            grey: (w) => w.other_run_rate,
          })}
          {row(<b>Total disbursements</b>, (w) => w.expenses_cents, { bold: true, of: totalExpense })}
          <tr>
            <td colSpan={columns.length + 1} style={group}>
              Position
            </td>
          </tr>
          {row(<b>Net cash flow</b>, (w) => w.net_cents, { bold: true, tone: true })}
          {row(<b>Ending balance</b>, (w) => w.ending_cash_cents ?? 0, { bold: true, tone: true })}
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
  const forecastMonday = useMemo(() => mondayOf(today), [today]);
  const windowEnd = useMemo(() => addDaysIso(today, HOME_FORECAST_DAYS), [today]);
  const actualFrom = useMemo(() => addDaysIso(forecastMonday, -ACTUAL_WEEKS * 7), [forecastMonday]);
  const actualTo = useMemo(() => addDaysIso(forecastMonday, -1), [forecastMonday]);

  const [chartGrain, setChartGrain] = useState<ChartGrain>("weekly");
  const [scenario, setScenario] = useState<Scenario>("base");
  const [tableUnit, setTableUnit] = useState<TableUnit>("dollars");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["cash-flow-home-kpis", operatingCompanyId, today, windowEnd],
    queryFn: () => getRollingLedger(operatingCompanyId, today, windowEnd),
    enabled: Boolean(operatingCompanyId),
  });

  const avpQuery = useQuery({
    queryKey: ["cash-flow-home-actuals", operatingCompanyId, actualFrom, actualTo],
    queryFn: () => getActualVsProjected(operatingCompanyId, actualFrom, actualTo),
    enabled: Boolean(operatingCompanyId),
  });

  const actualWeeks = useMemo(
    () => buildActualWeeks(avpQuery.data?.lines ?? [], today),
    [avpQuery.data, today],
  );

  const runRates = useMemo(() => {
    const incomeRunRate = avgPositive(actualWeeks.map((w) => w.income_cents));
    // Seed expense run-rates from the first forecast weeks' committed buckets when actuals
    // are bank-totals only (no category split). Diesel prefers the engine's fuel-avg rows.
    const seedWeeks = data
      ? Array.from({ length: 4 }, (_, i) => {
          const weekStart = addDaysIso(forecastMonday, i * 7);
          const inWeek = rowsInWeek(data.rows, weekStart);
          return {
            driver: sumCents(inWeek.filter((r) => expenseBucket(r) === "driver")),
            diesel: sumCents(inWeek.filter((r) => expenseBucket(r) === "diesel")),
            other: sumCents(inWeek.filter((r) => expenseBucket(r) === "other")),
          };
        })
      : [];
    const dieselFromEngine =
      data?.rows
        .filter((r) => /^fuel-avg-/.test(r.document_id) && !r.document_id.includes("partial"))
        .map((r) => r.amount_cents) ?? [];
    const dieselRunRate = dieselFromEngine[0] ?? avgPositive(seedWeeks.map((w) => w.diesel));
    const driverRunRate = avgPositive(seedWeeks.map((w) => w.driver));
    const otherRunRate = avgPositive(seedWeeks.map((w) => w.other));
    // When bank actual expense avg is known, residual "other" fills toward it.
    const expenseActualAvg = avgPositive(actualWeeks.map((w) => w.expenses_cents));
    const residualOther =
      expenseActualAvg > 0
        ? Math.max(0, expenseActualAvg - driverRunRate - dieselRunRate)
        : otherRunRate;
    return {
      incomeRunRate: incomeRunRate || avgPositive(
        data
          ? Array.from({ length: 4 }, (_, i) => {
              const weekStart = addDaysIso(forecastMonday, i * 7);
              return sumCents(rowsInWeek(data.rows, weekStart).filter(isInvoiceIncome));
            })
          : [],
      ),
      driverRunRate,
      dieselRunRate,
      otherRunRate: residualOther || otherRunRate,
    };
  }, [actualWeeks, data, forecastMonday]);

  const forecastWeeks = useMemo(
    () =>
      data
        ? buildForecastWeeks(
            data,
            today,
            scenario,
            runRates.incomeRunRate,
            runRates.driverRunRate,
            runRates.dieselRunRate,
            runRates.otherRunRate,
          )
        : [],
    [data, today, scenario, runRates],
  );

  const monthColumns = useMemo(
    () => buildMonthBuckets(forecastWeeks),
    [forecastWeeks],
  );

  const tableColumns = chartGrain === "monthly" ? monthColumns : forecastWeeks;

  // LEAD LOCK — do not change this weekly run-rate / actual-weeks formula.
  const weeklyRunRate = useMemo(() => {
    if (forecastWeeks.length === 0) return 0;
    const withActivity = forecastWeeks.filter((w) => w.income_cents !== 0 || w.expenses_cents !== 0);
    const src = withActivity.length ? withActivity : forecastWeeks;
    return Math.round(src.reduce((s, w) => s + w.net_cents, 0) / src.length);
  }, [forecastWeeks]);

  const next4WeeksIn = useMemo(() => {
    if (!data) return 0;
    const end = addDaysIso(today, 27);
    return data.rows
      .filter((r) => isInvoiceIncome(r) && r.due_date >= today && r.due_date <= end && !r.is_rollover_echo)
      .reduce((s, r) => s + r.amount_cents, 0);
  }, [data, today]);

  const lowest = useMemo(() => {
    let min: { cents: number; label: string } | null = null;
    for (const w of forecastWeeks) {
      if (w.ending_cash_cents === null) continue;
      if (min === null || w.ending_cash_cents < min.cents) {
        min = { cents: w.ending_cash_cents, label: `wk ${w.label}` };
      }
    }
    return min;
  }, [forecastWeeks]);

  const todayDay = data?.days.find((d) => d.date === today) ?? data?.days[0];
  const incomeToday = todayDay?.income_due_cents ?? 0;
  const expensesToday = todayDay?.expenses_due_cents ?? 0;

  const todayIncomeCount = useMemo(() => {
    if (!data) return 0;
    return data.rows.filter((r) => r.row_kind === "income" && r.due_date === today && !r.is_rollover_echo).length;
  }, [data, today]);

  const todayExpenseCount = useMemo(() => {
    if (!data) return 0;
    return data.rows.filter((r) => r.row_kind === "expense" && r.due_date === today && !r.is_rollover_echo).length;
  }, [data, today]);

  const incomeSpark = useMemo(
    () => sparkPoints(forecastWeeks.slice(0, 4).map((w) => w.income_cents), 96, 26),
    [forecastWeeks],
  );
  const runRateSpark = useMemo(
    () => sparkPoints(forecastWeeks.slice(0, 4).map((w) => w.net_cents), 96, 26),
    [forecastWeeks],
  );

  // Sibling tabs reachable from Home (verify-cash-flow-home-tab + REG-031).
  // manual_daily_projections stays wired even when the flag hides the visible control.
  const openSibling = (tab: Exclude<CashFlowTabId, "home">) => onNavigateToTab(tab);

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

      {data && (
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8 }}
          data-testid="cash-flow-home-v3-kpis"
        >
          <V3KpiTile
            label="Opening cash"
            value={data.opening_cash_cents === null ? "—" : formatUsdCents(data.opening_cash_cents)}
            sub="live · as shown in the app today"
            testId="cash-flow-home-v3-kpi-opening"
            onClick={() => openSibling("rolling_ledger")}
          />
          <V3KpiTile
            label="Income due today"
            value={formatUsdCents(incomeToday)}
            sub={`${todayIncomeCount} item${todayIncomeCount === 1 ? "" : "s"}`}
            testId="cash-flow-home-v3-kpi-income"
            onClick={() => openSibling("daily_prediction")}
          />
          <V3KpiTile
            label="Expenses due today"
            value={formatUsdCents(expensesToday)}
            sub={`${todayExpenseCount} item${todayExpenseCount === 1 ? "" : "s"}`}
            testId="cash-flow-home-v3-kpi-expenses"
            onClick={() => openSibling("daily_prediction")}
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
            onClick={() => openSibling("rolling_ledger")}
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
                <span>last 4 full weeks</span>
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
            onClick={() => openSibling("actual_vs_projected")}
          />
          <V3KpiTile
            label="Lowest balance"
            value={lowest ? formatCashFlowCents(lowest.cents, { sign: true }) : "—"}
            tone={lowest && lowest.cents < 0 ? "red" : "ink"}
            sub={lowest?.label ?? "no projected days"}
            testId="cash-flow-home-v3-kpi-lowest"
            onClick={() => openSibling("rolling_ledger")}
          />
        </div>
      )}

      {forecastWeeks.length > 0 && (
        <BoardSection
          title="Cash position — 4 weeks actual · 13 weeks forecast"
          onViewAll={() => openSibling("rolling_ledger")}
          headerRight={
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <V3Segmented
                value={chartGrain}
                onChange={setChartGrain}
                options={[
                  { id: "weekly", label: "Weekly" },
                  { id: "monthly", label: "Monthly" },
                ]}
                testId="cash-flow-home-chart-grain"
              />
              <V3Segmented
                value={scenario}
                onChange={setScenario}
                options={[
                  { id: "base", label: "Base" },
                  { id: "conservative", label: "Conservative" },
                ]}
                testId="cash-flow-home-scenario"
              />
            </span>
          }
          testId="cash-flow-home-chart-panel"
        >
          <CashPositionChart
            actualWeeks={chartGrain === "weekly" ? actualWeeks : []}
            forecastWeeks={
              chartGrain === "weekly"
                ? forecastWeeks
                : monthColumns.map((m) => ({
                    weekStart: m.monthStart,
                    label: m.label,
                    kind: m.kind,
                    invoice_cents: m.invoice_cents,
                    topup_cents: m.topup_cents,
                    finance_cents: m.finance_cents,
                    driver_cents: m.driver_cents,
                    diesel_cents: m.diesel_cents,
                    vendor_cents: m.vendor_cents,
                    other_cents: m.other_cents,
                    income_cents: m.income_cents,
                    expenses_cents: m.expenses_cents,
                    net_cents: m.net_cents,
                    ending_cash_cents: m.ending_cash_cents,
                    driver_run_rate: m.driver_run_rate,
                    diesel_run_rate: m.diesel_run_rate,
                    other_run_rate: m.other_run_rate,
                    topup_run_rate: m.topup_run_rate,
                  }))
            }
            openingCents={data?.opening_cash_cents ?? null}
            lowest={lowest}
          />
        </BoardSection>
      )}

      {forecastWeeks.length > 0 && (
        <BoardSection
          title="13-week cash flow"
          onViewAll={() => openSibling("rolling_ledger")}
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
          footer="Grey = run-rate estimate · black = committed documents · every cell opens what is behind it."
          testId="cash-flow-home-table-panel"
        >
          <ThirteenWeekTable columns={tableColumns} unit={tableUnit} onOpen={openSibling} />
        </BoardSection>
      )}

      {showManualProjections ? (
        <div style={{ fontSize: 11, color: V3.muted }}>
          <button
            type="button"
            onClick={() => openSibling("manual_daily_projections")}
            style={{
              font: `600 11px ${V3.font}`,
              color: V3.link,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
            data-testid="cash-flow-home-manual-link"
          >
            Manual Daily Projections →
          </button>
        </div>
      ) : (
        // Keep the sibling id in-source so Home always declares the full tab set (flag off = hidden).
        <span hidden data-sibling="manual_daily_projections" />
      )}
    </div>
  );
}
