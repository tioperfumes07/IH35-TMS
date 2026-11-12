import { useState, useCallback, useMemo } from "react";
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
import { formatDateUS, formatIsoDatesInText } from "../../../lib/formatDate";
import { formatQuantityTable, formatUsdCents } from "../../../lib/money";
import { entityLabel } from "../../../lib/entity-label";
import { ledgerPartyLabel } from "../ledgerPartyLabel";
import { companyLabel } from "../../../lib/formatCompanyName";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { V3, V3_EXPENSE_GROUPS } from "../../../design/v3-tokens";
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

/** Row 219 (D043): outlook chips "Thu 10/22/2026" — weekday + shared MM/DD/YYYY (was "Thu 10-22", no year). */
function fmtChipDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return formatDateUS(iso);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow] ?? "";
  const us = formatDateUS(iso);
  return us ? `${wd} ${us}` : "—";
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

export function DailyPredictionTab({ operatingCompanyId }: Props) {
  const navigate = useNavigate();
  const [date, setDate] = useState<string>(todayIso());
  const [grain, setGrain] = useState<Grain>("day");
  const [addLabel, setAddLabel] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const rangeFrom = grain === "week" ? mondayOf(date) : date;
  const rangeTo = grain === "week" ? addDaysIso(rangeFrom, 6) : date;
  // The query must include the whole displayed week, even when selected midweek.
  const windowFrom = rangeFrom;
  const windowTo = addDaysIso(windowFrom, 13);
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

  const incomeFlatRows = useMemo(
    () =>
      incomeGroups.flatMap(([group, rows]) =>
        rows.map((row) => ({ ...row, _group: group })),
      ),
    [incomeGroups],
  );

  const expenseFlatRows = useMemo(
    () =>
      expenseGroups.flatMap(({ key, rows }, idx) => {
        const title = expenseGroupTitle(key, idx);
        if (rows.length === 0) {
          return [
            {
              document_kind: "empty",
              document_id: `empty-${key}`,
              due_date: "",
              amount_cents: 0,
              row_kind: "expense" as const,
              type: "",
              counterparty: emptyExpenseHint(key),
              _group: title,
              _empty: true,
            } as RollingLedgerRow & { _group: string; _empty?: boolean },
          ];
        }
        return rows.map((row) => ({ ...row, _group: title }));
      }),
    [expenseGroups],
  );

  const incomeColumns = useMemo<ParityColumn<RollingLedgerRow & { _group: string }>[]>(
    () => [
      {
        key: "group",
        label: "Group",
        render: (item) => <span className="text-section-header font-semibold uppercase tracking-wide text-[#4B5563]">{item._group}</span>,
      },
      {
        key: "customer",
        label: "Customer",
        render: (item) => {
          const customerName = item.customer_name ?? item.counterparty;
          return item.customer_id ? (
            <EntityLinkOrTombstone
              kind="customer"
              id={item.customer_id}
              name={ledgerPartyLabel({ ...row, counterparty: customerName })}
              noun="Customer"
              className="font-medium"
              data-testid="cash-flow-predicted-customer-link"
            />
          ) : (
            <span data-testid="cash-flow-predicted-customer-link">
              {companyLabel(item.customer_name, null, "Customer")}
            </span>
          );
        },
      },
      {
        key: "type",
        label: "Type",
        render: (item) =>
          item.document_kind === "load" || /load/i.test(item.type)
            ? "Load · not invoiced"
            : item.type || item.document_kind,
      },
      {
        key: "load",
        label: "Load",
        render: (item) => (
          <EntityLinkOrTombstone
            kind={item.load_id ? "load" : "invoice"}
            id={item.load_id ?? item.document_id}
            name={item.load_number ?? item.document_label}
            noun={item.load_id ? "Load" : "Invoice"}
            className="font-medium"
            data-testid="cash-flow-predicted-load-link"
          />
        ),
      },
      {
        key: "amount",
        label: "Amount",
        cellClass: "text-right font-semibold",
        render: (item) => formatCents(item.amount_cents),
      },
    ],
    [],
  );

  const expenseColumns = useMemo<
    ParityColumn<RollingLedgerRow & { _group: string; _empty?: boolean }>[]
  >(
    () => [
      {
        key: "group",
        label: "Priority",
        render: (item) => <span className="text-section-header font-semibold uppercase tracking-wide text-[#4B5563]">{item._group}</span>,
      },
      {
        key: "payee",
        label: "Payee",
        render: (item) => {
          if (item._empty) return <span style={{ color: V3.mutedSoft }}>{item.counterparty}</span>;
          const payeeNoun =
            item.document_kind === "driver_bill" || item.document_kind === "settlement" || /driver/i.test(item.type)
              ? "Driver"
              : "Payee";
          return (
            <span data-testid="cash-flow-projected-expense-payee">
              {entityLabel(ledgerPartyLabel(item) || item.counterparty, null, payeeNoun)}
            </span>
          );
        },
      },
      {
        key: "doc",
        label: "Load / doc",
        render: (item) => {
          if (item._empty) return "—";
          const link = item.load_id ? (
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
            <span>{formatIsoDatesInText(item.document_label)}</span>
          );
          return (
            <span className="inline-flex flex-wrap items-center gap-2">
              {link}
              {item.adjustment_id ? (
                <button
                  type="button"
                  className="shrink-0 text-xs underline disabled:opacity-50"
                  style={{ color: V3.muted }}
                  disabled={archiveMutation.isPending}
                  onClick={() => {
                    setArchiveError(null);
                    archiveMutation.mutate(item.adjustment_id!);
                  }}
                  data-testid="cash-flow-adjustment-remove"
                >
                  Remove
                </button>
              ) : null}
            </span>
          );
        },
      },
      {
        key: "amount",
        label: "Amount",
        cellClass: "text-right font-semibold",
        render: (item) =>
          item._empty ? "—" : item.amount_known === false ? "Awaiting short miles" : formatCents(item.amount_cents),
      },
    ],
    [archiveMutation],
  );

  const sevenDays = useMemo(() => {
    if (!data) return [] as RollingLedgerDay[];
    const out: RollingLedgerDay[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDaysIso(rangeFrom, i);
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
  }, [data, rangeFrom]);

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
          <div style={{ fontSize: 11, fontWeight: 600, color: V3.muted, letterSpacing: "0.06em" }}>OPENING CASH</div>
          <div className="n" style={{ fontSize: 18, fontWeight: 700, color: V3.ink }}>
            {isLoading ? "—" : opening === null ? "—" : formatCents(opening)}
          </div>
        </div>
        <span style={{ color: V3.mutedSoft }}>+</span>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: V3.muted, letterSpacing: "0.06em" }}>INCOME − EXPENSES</div>
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
          <div style={{ fontSize: 11, fontWeight: 600, color: V3.muted, letterSpacing: "0.06em" }}>PROJECTED CLOSING</div>
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

      {/* CF3 — board: seven separate day tiles with gaps (not a joined strip + extra heading). */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6, minWidth: 0 }}
        data-testid="cash-flow-projected-outlook"
      >
        {sevenDays.map((entry) => {
          const isSelected = entry.date === date;
          const isToday = entry.date === todayIso();
          const pos = entry.net_cents >= 0;
          return (
            <button
              key={entry.date}
              type="button"
              // CF3 / Codex ROUND 8.5 — tile click selects that day AND forces grain=day so a week/month
              // view cannot leave the strip looking selected while the panels still show week aggregates.
              onClick={() => {
                setDate(entry.date);
                setGrain("day");
              }}
              title={`${pos ? "+" : ""}${formatUsdCents(entry.net_cents)}`}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                alignItems: "flex-start",
                padding: "8px 10px",
                border: `1px solid ${V3.border}`,
                borderRadius: 2,
                cursor: "pointer",
                background: isSelected ? V3.shell : isToday ? V3.headerBg : V3.surface,
                color: isSelected ? V3.onShell : V3.ink,
                fontFamily: V3.font,
                minWidth: 0,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.8, whiteSpace: "nowrap" }}>{fmtChipDate(entry.date)}</span>
              <span
                className="n"
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: isSelected ? V3.onShell : entry.net_cents === 0 ? V3.mutedSoft : pos ? V3.ink : V3.red,
                }}
              >
                {isLoading ? "—" : formatCompactNet(entry.net_cents)}
              </span>
              <span style={{ fontSize: 11, opacity: 0.75 }}>net</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Income */}
        <BoardSection
          title="Income"
          subtitle={`${formatQuantityTable(incomeRows.length, 0)} item${incomeRows.length === 1 ? "" : "s"}`}
          onViewAll={() => navigate("/cash-flow?tab=rolling_ledger")}
          testId="cash-flow-projected-income-panel"
        >
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-[32px] animate-pulse rounded-sm" style={{ background: V3.headerBg }} />
              ))}
            </div>
          ) : (
            <ParityTable
              appearance="board"
              title="Income"
              columns={incomeColumns}
              rows={incomeFlatRows}
              rowKey={(row) => `${row.document_kind}-${row.document_id}-${row.due_date}`}
              loading={isLoading}
              emptyText={`No income due for this ${grain}.`}
              storageKey="cash-flow-projected-income"
              tableTestId="cash-flow-projected-income-table"
              suppressToolbarSearch
              suppressToolbarRange
              footerCells={{
                customer: "Total income",
                amount: formatCents(totals.income),
              }}
            />
          )}
        </BoardSection>

        {/* Expenses */}
        <BoardSection
          title="Expenses"
          subtitle="in payment priority order"
          onViewAll={() => navigate("/cash-flow?tab=rolling_ledger")}
          testId="cash-flow-projected-expense-panel"
        >
          <>
            <ParityTable
              appearance="board"
              title="Expenses"
              columns={expenseColumns}
              rows={expenseFlatRows}
              rowKey={(row) =>
                row._empty
                  ? `empty-${row.document_id}`
                  : `${row.document_kind}-${row.document_id}-${row.due_date}-${row.adjustment_id ?? ""}`
              }
              loading={isLoading}
              emptyText="No expenses in this window."
              storageKey="cash-flow-projected-expenses"
              tableTestId="cash-flow-projected-expense-table"
              suppressToolbarSearch
              suppressToolbarRange
              footerCells={{
                payee: "Total expenses",
                amount: formatCents(totals.expenses),
              }}
            />

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
