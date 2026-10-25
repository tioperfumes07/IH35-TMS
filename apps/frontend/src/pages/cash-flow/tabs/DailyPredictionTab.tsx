import { useState, useCallback, useMemo, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import {
  getRollingLedger,
  addCashFlowAdjustment,
  archiveCashFlowAdjustment,
  type RollingLedgerRow,
  type RollingLedgerDay,
  type RollingLedgerResult,
} from "../../../api/cashFlow";
import { addDaysIso, companyToday } from "../../../lib/businessDate";
import { formatDateUS } from "../../../lib/formatDate";
import { formatUsdCents } from "../../../lib/money";
import { entityLabel } from "../../../lib/entity-label";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { V3, V3_EXPENSE_GROUPS, V3_TABLE } from "../../../design/v3-tokens";
import { BoardSection } from "../../../components/v3/BoardSection";
import { V3Segmented } from "../../../components/v3/V3Segmented";

// ROUND 443.250 — Projected (Auto) V3 board. ONE engine: getRollingLedger (same as Home /
// Rolling Ledger). Day/Week grain, formula strip, 7-day outlook, Income|Expenses panels.
// Manual projection adjustments stay (create + archive Remove). Square edges = 2px.

type Grain = "day" | "week";

type Props = {
  operatingCompanyId: string;
};

function todayIso(): string {
  return companyToday();
}

function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  return addDaysIso(iso, delta);
}

/** D043 — owner 10-24: MM/DD/YYYY everywhere (no month names). */
function fmtLongDate(iso: string): string {
  return formatDateUS(iso);
}

/** Board CashFlow-Projected outlook chips: "Thu 10-22" (weekday + MM-DD, no year on the chip). */
function fmtChipDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return formatDateUS(iso);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow] ?? "";
  return `${wd} ${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function formatCents(cents: number, opts?: { sign?: boolean }): string {
  const abs = Math.abs(cents);
  const dollars = formatUsdCents(abs);
  if (opts?.sign && cents < 0) return `−${dollars}`;
  if (opts?.sign && cents > 0) return `+${dollars}`;
  return cents < 0 ? `−${dollars}` : dollars;
}

/** D042 — outlook nets: full currency with two decimals + $ (never a `k` suffix); zero = em dash. */
function formatCompactNet(cents: number): string {
  if (cents === 0) return "—";
  const body = formatUsdCents(Math.abs(cents));
  return cents < 0 ? `−${body}` : `+${body}`;
}

function incomeGroupLabel(row: RollingLedgerRow): string {
  if (row.document_kind === "invoice" || row.type === "Invoice") return "Invoices";
  if (row.document_kind === "load" || /load/i.test(row.type)) {
    return "Delivered / in-motion loads (not invoiced yet)";
  }
  if (row.document_kind === "factoring_advance") return "Factoring advances";
  return "Other income";
}

function expenseGroupKey(row: RollingLedgerRow): (typeof V3_EXPENSE_GROUPS)[number] {
  const t = `${row.type} ${row.document_kind} ${row.document_label}`.toLowerCase();
  if (/loan|lease|amort|note|rent/.test(t)) return "finance & lease";
  if (/driver|settlement|driver_bill/.test(t) || row.document_kind === "driver_bill" || row.document_kind === "settlement") {
    return "driver bills";
  }
  if (/diesel|fuel|relay|card fill/.test(t)) return "diesel";
  if (/maint|tire|parts|shop|work.?order/.test(t)) return "maintenance";
  if (/insur/.test(t)) return "insurance";
  return "other";
}

function expenseGroupTitle(key: (typeof V3_EXPENSE_GROUPS)[number], index: number): string {
  const titles: Record<(typeof V3_EXPENSE_GROUPS)[number], string> = {
    "finance & lease": "Finance & lease payments",
    "driver bills": "Driver bills — due on load delivery date",
    diesel: "Diesel — card fills & card payments",
    maintenance: "Maintenance — shop, tires, parts",
    insurance: "Insurance",
    other: "Dispatch, tolls & other",
  };
  return `${index + 1} · ${titles[key]}`;
}

function emptyExpenseHint(key: (typeof V3_EXPENSE_GROUPS)[number]): string {
  const hints: Record<(typeof V3_EXPENSE_GROUPS)[number], string> = {
    "finance & lease": "No loan or lease schedules in the system for this day — add them to project truck notes and rents.",
    "driver bills": "No driver bills due this day.",
    diesel: "No fills posted yet for this day.",
    maintenance: "Nothing due this day.",
    insurance: "Installment schedule not loaded for this day.",
    other: "Nothing due this day.",
  };
  return hints[key];
}

function rowsForRange(rows: RollingLedgerRow[], from: string, to: string): RollingLedgerRow[] {
  return rows.filter((r) => r.due_date >= from && r.due_date <= to && !r.is_rollover_echo);
}

function dayTotals(days: RollingLedgerDay[], from: string, to: string) {
  const inRange = days.filter((d) => d.date >= from && d.date <= to);
  return {
    income: inRange.reduce((s, d) => s + d.income_due_cents, 0),
    expenses: inRange.reduce((s, d) => s + d.expenses_due_cents, 0),
    net: inRange.reduce((s, d) => s + d.net_cents, 0),
    closing: [...inRange].reverse().find((d) => d.running_cash_cents !== null)?.running_cash_cents ?? null,
  };
}

function openingForSelection(data: RollingLedgerResult, from: string): number | null {
  const day = data.days.find((d) => d.date === from);
  if (!day || data.opening_cash_cents === null) return data.opening_cash_cents;
  // Reconstruct opening = running − net for that day when running is known.
  if (day.running_cash_cents !== null) return day.running_cash_cents - day.net_cents;
  return data.opening_cash_cents;
}

const thStyle: CSSProperties = {
  textAlign: "left",
  fontSize: V3_TABLE.headerPx,
  fontWeight: 600,
  color: V3.muted,
  padding: `${V3_TABLE.rowPadY}px 12px`,
  borderBottom: `1px solid ${V3.border}`,
  background: V3.headerBg,
  whiteSpace: "nowrap",
  fontFamily: V3.font,
};

const tdStyle: CSSProperties = {
  textAlign: "left",
  padding: `${V3_TABLE.rowPadY}px 12px`,
  borderBottom: `1px solid ${V3.borderSoft}`,
  fontSize: V3_TABLE.fontPx,
  whiteSpace: "nowrap",
  color: V3.ink,
  fontFamily: V3.font,
};

export function DailyPredictionTab({ operatingCompanyId }: Props) {
  const navigate = useNavigate();
  const [date, setDate] = useState<string>(todayIso());
  const [grain, setGrain] = useState<Grain>("day");
  const [addLabel, setAddLabel] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const windowFrom = useMemo(() => date, [date]);
  const windowTo = useMemo(() => addDaysIso(date, 13), [date]);
  const queryKey = ["cash-flow-projected-ledger", operatingCompanyId, windowFrom, windowTo];

  const { data, isLoading, isError } = useQuery<RollingLedgerResult>({
    queryKey,
    queryFn: () => getRollingLedger(operatingCompanyId, windowFrom, windowTo),
    enabled: !!operatingCompanyId,
  });

  const mutation = useMutation({
    mutationFn: (payload: { label: string; amount_cents: number }) =>
      addCashFlowAdjustment({
        operating_company_id: operatingCompanyId,
        entry_date: date,
        label: payload.label,
        amount_cents: payload.amount_cents,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      setAddLabel("");
      setAddAmount("");
      setAddError(null);
    },
    onError: () => {
      setAddError("Failed to save. Please try again.");
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (adjustmentId: string) => archiveCashFlowAdjustment(adjustmentId, operatingCompanyId),
    onSuccess: () => {
      setArchiveError(null);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (e) => {
      setArchiveError(e instanceof Error ? e.message : "Failed to remove adjustment. Please try again.");
    },
  });

  const adjustmentReady = useMemo(() => {
    const trimLabel = addLabel.trim();
    if (!trimLabel) return false;
    const parsedCents = Math.round(parseFloat(addAmount.replace(/[^0-9.-]/g, "")) * 100);
    if (!Number.isFinite(parsedCents) || parsedCents === 0) return false;
    if (mutation.isPending) return false;
    return true;
  }, [addLabel, addAmount, mutation.isPending]);

  const handleAddSubmit = useCallback(() => {
    if (!adjustmentReady) {
      const trimLabel = addLabel.trim();
      const parsedCents = Math.round(parseFloat(addAmount.replace(/[^0-9.-]/g, "")) * 100);
      if (!trimLabel) {
        setAddError("Label is required.");
        return;
      }
      if (!Number.isFinite(parsedCents) || parsedCents === 0) {
        setAddError("Enter a valid nonzero dollar amount.");
        return;
      }
      return;
    }
    const trimLabel = addLabel.trim();
    const parsedCents = Math.round(parseFloat(addAmount.replace(/[^0-9.-]/g, "")) * 100);
    setAddError(null);
    mutation.mutate({ label: trimLabel, amount_cents: parsedCents });
  }, [addLabel, addAmount, adjustmentReady, mutation]);

  const rangeFrom = grain === "week" ? mondayOf(date) : date;
  const rangeTo = grain === "week" ? addDaysIso(rangeFrom, 6) : date;

  const totals = useMemo(() => {
    if (!data) return { income: 0, expenses: 0, net: 0, closing: null as number | null };
    return dayTotals(data.days, rangeFrom, rangeTo);
  }, [data, rangeFrom, rangeTo]);

  const opening = useMemo(() => (data ? openingForSelection(data, rangeFrom) : null), [data, rangeFrom]);
  const projectedClosing =
    opening !== null ? opening + totals.net : totals.closing;

  const incomeRows = useMemo(
    () => (data ? rowsForRange(data.rows, rangeFrom, rangeTo).filter((r) => r.row_kind === "income") : []),
    [data, rangeFrom, rangeTo],
  );
  const expenseRows = useMemo(
    () => (data ? rowsForRange(data.rows, rangeFrom, rangeTo).filter((r) => r.row_kind === "expense") : []),
    [data, rangeFrom, rangeTo],
  );

  const incomeGroups = useMemo(() => {
    const map = new Map<string, RollingLedgerRow[]>();
    for (const row of incomeRows) {
      const g = incomeGroupLabel(row);
      const list = map.get(g) ?? [];
      list.push(row);
      map.set(g, list);
    }
    return [...map.entries()];
  }, [incomeRows]);

  const expenseGroups = useMemo(() => {
    return V3_EXPENSE_GROUPS.map((key) => ({
      key,
      rows: expenseRows.filter((r) => expenseGroupKey(r) === key),
    }));
  }, [expenseRows]);

  const sevenDays = useMemo(() => {
    if (!data) return [] as RollingLedgerDay[];
    const out: RollingLedgerDay[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDaysIso(date, i);
      out.push(
        data.days.find((x) => x.date === d) ?? {
          date: d,
          income_due_cents: 0,
          expenses_due_cents: 0,
          income_carry_over_cents: 0,
          expenses_carry_over_cents: 0,
          net_cents: 0,
          running_cash_cents: null,
        },
      );
    }
    return out;
  }, [data, date]);

  const unknownAmountCount = expenseRows.filter((r) => r.amount_known === false).length;
  const netPositive = totals.net >= 0;

  const goPrev = () => setDate((d) => addDaysIso(d, grain === "week" ? -7 : -1));
  const goNext = () => setDate((d) => addDaysIso(d, grain === "week" ? 7 : 1));

  const navLabel =
    grain === "week"
      ? `${fmtLongDate(rangeFrom)} – ${fmtLongDate(rangeTo)}`
      : `${fmtLongDate(date)}${date === todayIso() ? " · Today" : ""}`;

  return (
    <div className="space-y-3" data-testid="cash-flow-projected-v3" style={{ fontFamily: V3.font }}>
      {unknownAmountCount > 0 && (
        <p role="status" style={{ fontSize: 12, color: V3.muted }}>
          {unknownAmountCount} expense line{unknownAmountCount === 1 ? "" : "s"} awaiting short miles.
        </p>
      )}

      {/* Date + Day/Week */}
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
        data-testid="cash-flow-projected-nav"
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={goPrev}
            className="flex size-8 items-center justify-center rounded-sm"
            style={{ border: `1px solid ${V3.border}`, background: V3.surface }}
            aria-label={grain === "week" ? "Previous week" : "Previous day"}
          >
            <ChevronLeft className="h-4 w-4" style={{ color: V3.muted }} />
          </button>
          <span style={{ fontSize: 14, fontWeight: 700, color: V3.ink }}>{navLabel}</span>
          <button
            type="button"
            onClick={goNext}
            className="flex size-8 items-center justify-center rounded-sm"
            style={{ border: `1px solid ${V3.border}`, background: V3.surface }}
            aria-label={grain === "week" ? "Next week" : "Next day"}
          >
            <ChevronRight className="h-4 w-4" style={{ color: V3.muted }} />
          </button>
          {date !== todayIso() && (
            <button
              type="button"
              onClick={() => setDate(todayIso())}
              style={{ fontSize: 11, color: V3.link, background: "none", border: "none", cursor: "pointer" }}
            >
              Back to today
            </button>
          )}
        </div>
        <V3Segmented
          value={grain}
          options={[
            { id: "day", label: "Day" },
            { id: "week", label: "Week" },
          ]}
          onChange={setGrain}
          testId="cash-flow-projected-grain"
        />
      </div>

      {/* Formula strip: OPENING + (INCOME − EXPENSES) = PROJECTED CLOSING */}
      <div
        data-testid="cash-flow-projected-formula"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr auto 1fr",
          alignItems: "center",
          gap: 12,
          background: V3.surface,
          border: `1px solid ${V3.border}`,
          borderRadius: 2,
          padding: "12px 16px",
        }}
      >
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: V3.muted, letterSpacing: "0.06em" }}>OPENING CASH</div>
          <div className="n" style={{ fontSize: 18, fontWeight: 700, color: V3.ink }}>
            {isLoading ? "—" : opening === null ? "—" : formatCents(opening)}
          </div>
        </div>
        <span style={{ color: V3.mutedSoft }}>+</span>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: V3.muted, letterSpacing: "0.06em" }}>INCOME − EXPENSES</div>
          <div
            className="n"
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: isLoading ? V3.ink : netPositive ? V3.green : V3.red,
            }}
          >
            {isLoading ? "—" : formatCents(totals.net, { sign: true })}
          </div>
        </div>
        <span style={{ color: V3.mutedSoft }}>=</span>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: V3.muted, letterSpacing: "0.06em" }}>PROJECTED CLOSING</div>
          <div
            className="n"
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: projectedClosing !== null && projectedClosing < 0 ? V3.red : V3.ink,
            }}
          >
            {isLoading || projectedClosing === null ? "—" : formatCents(projectedClosing)}
          </div>
        </div>
      </div>

      {isError && (
        <div
          className="rounded-sm px-4 py-3 text-xs"
          style={{ border: `1px solid ${V3.border}`, background: V3.headerBg, color: V3.red }}
          role="alert"
        >
          Failed to load projection. Check your connection and try again.
        </div>
      )}

      {/* 7-Day Outlook — flat section + divide-x (ORPH-004). Selected cell uses shell navy. V3 tokens only. */}
      <section
        style={{
          overflow: "hidden",
          borderRadius: 2,
          border: `1px solid ${V3.border}`,
          background: V3.surface,
          fontFamily: V3.font,
        }}
        data-testid="cash-flow-projected-outlook"
      >
        <div style={{ borderBottom: `1px solid ${V3.borderSoft}`, background: V3.headerBg, padding: "8px 14px" }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: V3.muted, margin: 0 }}>
            7-Day Outlook
          </p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", minWidth: 420 }}>
            {sevenDays.map((entry, i) => {
              const isSelected = entry.date === date;
              const isToday = entry.date === todayIso();
              const pos = entry.net_cents >= 0;
              return (
                <button
                  key={entry.date}
                  type="button"
                  onClick={() => setDate(entry.date)}
                  title={`${pos ? "+" : ""}${formatUsdCents(entry.net_cents)}`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    padding: "8px 4px",
                    border: "none",
                    borderLeft: i === 0 ? "none" : `1px solid ${V3.borderSoft}`,
                    cursor: "pointer",
                    background: isSelected ? V3.shell : isToday ? V3.headerBg : V3.surface,
                    color: isSelected ? V3.onShell : V3.ink,
                    fontFamily: V3.font,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>{fmtChipDate(entry.date)}</span>
                  <span
                    className="n"
                    style={{
                      marginTop: 2,
                      fontSize: 14,
                      fontWeight: 700,
                      color: isSelected ? V3.onShell : entry.net_cents === 0 ? V3.mutedSoft : pos ? V3.ink : V3.red,
                    }}
                  >
                    {isLoading ? "—" : formatCompactNet(entry.net_cents)}
                  </span>
                  <span style={{ fontSize: 10, opacity: 0.75 }}>net</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Income */}
        <BoardSection
          title="Income"
          subtitle={`${incomeRows.length} item${incomeRows.length === 1 ? "" : "s"}`}
          onViewAll={() => navigate("/cash-flow?tab=rolling_ledger")}
          testId="cash-flow-projected-income-panel"
        >
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-[32px] animate-pulse rounded-sm" style={{ background: V3.headerBg }} />
              ))}
            </div>
          ) : incomeRows.length === 0 ? (
            <p style={{ padding: 16, fontSize: 12, color: V3.muted }}>No income due for this {grain}.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Customer</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Load</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {incomeGroups.map(([group, rows]) => {
                    const groupTotal = rows.reduce((s, r) => s + r.amount_cents, 0);
                    return (
                      <IncomeGroupRows key={group} group={group} rows={rows} groupTotal={groupTotal} />
                    );
                  })}
                  <tr>
                    <td colSpan={3} style={{ ...tdStyle, fontWeight: 700, background: V3.headerBg, borderTop: `1px solid ${V3.border}` }}>
                      Total income
                    </td>
                    <td
                      className="n"
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontWeight: 700,
                        background: V3.headerBg,
                        borderTop: `1px solid ${V3.border}`,
                      }}
                    >
                      {formatCents(totals.income)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </BoardSection>

        {/* Expenses */}
        <BoardSection
          title="Expenses"
          subtitle="in payment priority order"
          onViewAll={() => navigate("/cash-flow?tab=rolling_ledger")}
          testId="cash-flow-projected-expense-panel"
        >
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-[32px] animate-pulse rounded-sm" style={{ background: V3.headerBg }} />
              ))}
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Payee</th>
                      <th style={thStyle}>Load / doc</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseGroups.map(({ key, rows }, idx) => {
                      const groupTotal = rows.reduce((s, r) => s + r.amount_cents, 0);
                      return (
                        <ExpenseGroupRows
                          key={key}
                          title={expenseGroupTitle(key, idx)}
                          hint={emptyExpenseHint(key)}
                          rows={rows}
                          groupTotal={groupTotal}
                          archivePending={archiveMutation.isPending}
                          onArchiveClick={(item) => {
                            setArchiveError(null);
                            archiveMutation.mutate(item.adjustment_id!);
                          }}
                        />
                      );
                    })}
                    <tr>
                      <td colSpan={2} style={{ ...tdStyle, fontWeight: 700, background: V3.headerBg, borderTop: `1px solid ${V3.border}` }}>
                        Total expenses
                      </td>
                      <td
                        className="n"
                        style={{
                          ...tdStyle,
                          textAlign: "right",
                          fontWeight: 700,
                          background: V3.headerBg,
                          borderTop: `1px solid ${V3.border}`,
                        }}
                      >
                        {formatCents(totals.expenses)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {archiveError ? (
                <p
                  className="px-4 pt-2 text-xs"
                  style={{ color: V3.red }}
                  data-testid="cash-flow-adjustment-archive-error"
                  role="alert"
                >
                  {archiveError}
                </p>
              ) : null}

              <div
                className="border-t border-dashed px-4 py-3"
                style={{ borderColor: V3.border }}
                data-testid="cash-flow-adjustment-create"
              >
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: V3.muted }}>
                  Add cash-flow adjustment
                </p>
                <p className="mb-2 text-xs" style={{ color: V3.muted }}>
                  Projection only — does not create an accounting bill or expense.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Label (e.g. Fuel surcharge)"
                    value={addLabel}
                    onChange={(e) => setAddLabel(e.target.value)}
                    className="flex-1 rounded-sm border px-2 py-1.5 text-xs focus:outline-hidden"
                    style={{ borderColor: V3.border }}
                  />
                  <MoneyInput
                    valueDollars={addAmount ? Number(addAmount.replace(/[^0-9.-]/g, "")) || null : null}
                    onChangeDollars={(d) => setAddAmount(d == null ? "" : String(d))}
                    ariaLabel="Projection amount (USD)"
                    className="w-24"
                  />
                  <button
                    type="button"
                    onClick={handleAddSubmit}
                    disabled={!adjustmentReady}
                    data-testid="cash-flow-adjustment-add"
                    className="flex items-center gap-1 rounded-sm px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                    style={{ background: V3.shell, color: V3.onShell }}
                  >
                    <Plus className="h-3 w-3" />
                    Create
                  </button>
                </div>
                {addError && (
                  <p className="mt-1 text-xs" style={{ color: V3.red }}>
                    {addError}
                  </p>
                )}
              </div>
            </>
          )}
        </BoardSection>
      </div>

      {/* One-engine measured note (board amber callout) */}
      <div
        data-testid="cash-flow-projected-one-engine-note"
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          background: V3.surface,
          border: `1px solid ${V3.border}`,
          borderLeft: `3px solid ${V3.amber}`,
          borderRadius: 2,
          padding: "8px 12px",
          fontSize: 12,
          color: V3.ink,
        }}
      >
        <b style={{ color: V3.amber, whiteSpace: "nowrap" }}>Measured</b>
        <span>
          Income and expenses on this tab read the same rolling-ledger list as Home and Rolling Ledger
          (one engine). Driver bills are due on the load delivery date.
        </span>
      </div>
    </div>
  );
}

function IncomeGroupRows({
  group,
  rows,
  groupTotal,
}: {
  group: string;
  rows: RollingLedgerRow[];
  groupTotal: number;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={3}
          style={{
            ...tdStyle,
            background: V3.band,
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {group}
        </td>
        <td className="n" style={{ ...tdStyle, background: V3.band, fontWeight: 700, textAlign: "right" }}>
          {formatCents(groupTotal)}
        </td>
      </tr>
      {rows.map((item) => {
        // customer_name rides the ledger row (same string as counterparty for single-customer income).
        const customerName = item.customer_name ?? item.counterparty;
        const typeLabel =
          item.document_kind === "load" || /load/i.test(item.type)
            ? "Load · not invoiced"
            : item.type || item.document_kind;
        return (
          <tr key={`${item.document_kind}-${item.document_id}-${item.due_date}`}>
            <td style={tdStyle}>
              {item.customer_id ? (
                <EntityLinkOrTombstone
                  kind="customer"
                  id={item.customer_id}
                  name={customerName}
                  noun="Customer"
                  className="font-medium"
                  data-testid="cash-flow-predicted-customer-link"
                />
              ) : (
                <span data-testid="cash-flow-predicted-customer-link">
                  {entityLabel(item.customer_name, null, "Customer")}
                </span>
              )}
            </td>
            <td style={tdStyle}>{typeLabel}</td>
            <td style={tdStyle}>
              <EntityLinkOrTombstone
                kind={item.load_id ? "load" : "invoice"}
                id={item.load_id ?? item.document_id}
                name={item.load_number ?? item.document_label}
                noun={item.load_id ? "Load" : "Invoice"}
                className="font-medium"
                data-testid="cash-flow-predicted-load-link"
              />
            </td>
            <td className="n" style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>
              {formatCents(item.amount_cents)}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function ExpenseGroupRows({
  title,
  hint,
  rows,
  groupTotal,
  archivePending,
  onArchiveClick,
}: {
  title: string;
  hint: string;
  rows: RollingLedgerRow[];
  groupTotal: number;
  archivePending: boolean;
  onArchiveClick: (item: RollingLedgerRow) => void;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={2}
          style={{
            ...tdStyle,
            background: V3.band,
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {title}
        </td>
        <td className="n" style={{ ...tdStyle, background: V3.band, fontWeight: 700, textAlign: "right" }}>
          {formatCents(groupTotal)}
        </td>
      </tr>
      {rows.length === 0 ? (
        <tr>
          <td colSpan={3} style={{ ...tdStyle, color: V3.mutedSoft }}>
            {hint}
          </td>
        </tr>
      ) : (
        rows.map((item) => {
          // D073 — driver bills / settlements are people: proper-case via formatPersonName (never ALL CAPS).
          const payeeNoun =
            item.document_kind === "driver_bill" || item.document_kind === "settlement" || /driver/i.test(item.type)
              ? "Driver"
              : "Payee";
          return (
          <tr key={`${item.document_kind}-${item.document_id}-${item.due_date}`}>
            <td style={tdStyle}>
              <span data-testid="cash-flow-projected-expense-payee">{entityLabel(item.counterparty, null, payeeNoun)}</span>
            </td>
            <td style={tdStyle}>
              {item.load_id ? (
                <EntityLinkOrTombstone
                  kind="load"
                  id={item.load_id}
                  name={item.load_number ?? item.document_label}
                  noun="Load"
                  data-testid="cash-flow-predicted-expense-load-link"
                />
              ) : item.document_kind === "settlement" || item.document_kind === "driver_bill" ? (
                <EntityLinkOrTombstone
                  kind="settlement"
                  id={item.document_id}
                  name={item.document_label}
                  noun="Settlement"
                  data-testid="cash-flow-predicted-expense-settlement-link"
                />
              ) : item.document_kind === "bill" ? (
                <EntityLinkOrTombstone
                  kind="bill"
                  id={item.document_id}
                  name={item.document_label}
                  noun="Bill"
                  data-testid="cash-flow-predicted-expense-bill-link"
                />
              ) : (
                <span>{item.document_label}</span>
              )}
              {item.adjustment_id ? (
                <button
                  type="button"
                  className="ml-3 shrink-0 text-xs underline disabled:opacity-50"
                  style={{ color: V3.muted }}
                  disabled={archivePending}
                  onClick={() => onArchiveClick(item)}
                  data-testid="cash-flow-adjustment-remove"
                >
                  Remove
                </button>
              ) : null}
            </td>
            <td className="n" style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>
              {item.amount_known === false ? "Awaiting short miles" : formatCents(item.amount_cents)}
            </td>
          </tr>
          );
        })
      )}
    </>
  );
}
