import { useMemo, useState, type CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "../../../hooks/useTranslation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  getRollingLedger,
  getCashFlowAdjustmentReasons,
  createCashFlowRowAdjustment,
  type RollingLedgerResult,
  type RollingLedgerRow,
  type RollingLedgerDay,
  type CashFlowAdjustmentReason,
} from "../../../api/cashFlow";
import { addDaysIso, companyToday, monthBoundsIso } from "../../../lib/businessDate";
import { formatDateUS } from "../../../lib/formatDate";
import { formatUsdCents } from "../../../lib/money";
import { EntityLink, resolveEntityRoute, type EntityKind } from "../../../components/shared/EntityLink";
import { DatePicker } from "../../../components/forms/DatePicker";
import { Combobox } from "../../../components/Combobox";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { SettlementRefCell } from "../../../components/shared/SettlementRefCell";
import { SelectCombobox } from "../../../components/Combobox";
import { V3, V3_EXPENSE_GROUPS } from "../../../design/v3-tokens";
import { BoardSection } from "../../../components/v3/BoardSection";
import { V3Segmented } from "../../../components/v3/V3Segmented";

// Two Rolling Ledger document kinds (card_payable, relay_topup — added by #f8ea8f01c4) have no EntityKind / record
// page yet: they render as plain labels instead of a link to a page that does not exist (web build TS2322 fix).
function ledgerEntityKind(kind: RollingLedgerRow["document_kind"]): EntityKind | null {
  return kind === "card_payable" || kind === "relay_topup" ? null : (kind as EntityKind);
}

// CASH-FLOW-02 (owner order 2026-09-06 20:1x/20:2x/20:5xZ). A daily snapshot with roll-over:
// every expected dollar carries its own due date and stays until paid/matched.
//
// ROUND 16.7 item 0 (owner 2026-09-06 21:1xZ): the prior pass rendered 3 hand-written HTML
// table markup blocks, which regressed scripts/verify-go26-consolidation-ratchet.mjs
// (raw_table_outside_infra) for every branch. All 3 registers (Expected income, Expected
// expenses, Day grid) now use the shared ParityTable component instead.
//
// ROUND 16.7 CORRECTION (owner 2026-09-06 22:0x/5:0xZ, verbatim): "THAT IS NOT THE QBO STYLE
// FILTER I ALREADY TOLD YOU". The filter bar below reuses Banking's own components
// (BankingTransactionsDesignView.tsx) verbatim: Combobox for "Filter by description", the same
// 28px segmented-button pattern for All/Income/Expenses and By day/By type, DatePicker From/To
// always visible + an outlined Presets shortcut, and the same dropdown-button-with-chevron
// pattern for "All transaction types" / "Rolled over: show". "THE ADJUST EXPECTATION ... WILL
// ONLY COME IN EXPECTED INCOME SIDE" — the multi-field AdjustPopover now renders ONLY for income
// rows; expense rows get a lightweight "Roll over ▾" reason menu + a separate "Stop" action, no
// popup. The day-navigator card ("‹ Sun, Sep 6 · Today ›", 64px) and the split-screen layout are
// restored/kept exactly as before this correction.
//
// ROUND 443.250 — Rolling Ledger V3 board: same engine (getRollingLedger), V3 tokens + BoardSection
// chrome, carried past-due panels, Day/Week day-grid grain. ParityTable / adjust / filter
// contracts unchanged (verify-cash-flow-rolling-ledger.mjs).
//
// ROUND 443.280-A #10 — rebuild-not-layer: board KPIs via V3KpiTile (remove layered CashFlowKpiStrip),
// Party/Doc·load/Due/Amount registers, carried Group/Items/Amount, day grid Date/Income/Expenses/Net/
// Running cash. Banking filter contracts stay behind Filters ▾ (verify-cash-flow-rolling-ledger.mjs).

const TYPE_OPTIONS = [
  { value: "Bill", label: "Bills" },
  { value: "Driver pay", label: "Driver pay" },
  { value: "Driver bill", label: "Driver bills" },
  { value: "Expense — unmatched", label: "Expenses" },
  { value: "Loan payment", label: "Loan payments" },
  { value: "Invoice", label: "Invoices" },
  { value: "Factor advance", label: "Factor advances" },
  { value: "Factor reserve", label: "Reserves" },
  { value: "Load (not invoiced)", label: "Loads (not invoiced)" },
];

type DatePreset = "7d" | "14d" | "30d" | "this_month" | "next_month";

const PRESET_OPTIONS: { value: DatePreset; label: string }[] = [
  { value: "7d", label: "Next 7 days" },
  { value: "14d", label: "Next 14 days" },
  { value: "30d", label: "Next 30 days" },
  { value: "this_month", label: "This month" },
  { value: "next_month", label: "Next month" },
];

function presetRange(preset: DatePreset, today: string): { from: string; to: string } {
  if (preset === "7d") return { from: today, to: addDaysIso(today, 6) };
  if (preset === "14d") return { from: today, to: addDaysIso(today, 13) };
  if (preset === "30d") return { from: today, to: addDaysIso(today, 29) };
  if (preset === "this_month") {
    const { start, end } = monthBoundsIso(today);
    return { from: start, to: end };
  }
  const { start, end } = monthBoundsIso(addDaysIso(monthBoundsIso(today).end, 1));
  return { from: start, to: end };
}

function formatCents(cents: number, opts?: { sign?: boolean }): string {
  const abs = Math.abs(cents);
  const dollars = formatUsdCents(abs);
  if (opts?.sign && cents < 0) return `−${dollars}`;
  if (opts?.sign && cents > 0) return `+${dollars}`;
  return cents < 0 ? `−${dollars}` : dollars;
}

/** D043 — owner 10-24: MM/DD/YYYY on Due cells. */
function fmtDateShort(iso: string): string {
  return formatDateUS(iso);
}

function isFactoringRow(type: string): boolean {
  return type === "Factor advance" || type === "Factor reserve";
}

/** Board day-grid / navigator: "Thu 10-22" (weekday + MM-DD). */
function fmtChipDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return formatDateUS(iso);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow] ?? "";
  return `${wd} ${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Board day navigator center: "Thu, Oct 22 · Today" (board chrome; Due cells stay MM/DD/YYYY). */
function fmtNavDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return formatDateUS(iso);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getUTCDay()] ?? "";
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1] ?? "";
  return `${wd}, ${mon} ${d}`;
}

function emptyExpenseHint(key: (typeof V3_EXPENSE_GROUPS)[number]): string {
  const hints: Record<(typeof V3_EXPENSE_GROUPS)[number], string> = {
    "finance & lease": "No loan or lease schedules entered for USMCA",
    "driver bills": "No driver bills due this day.",
    diesel: "No card payment due today (Dreamline · WEX · Relay)",
    maintenance: "Nothing due",
    insurance: "Installments not loaded",
    other: "Nothing due",
  };
  return hints[key];
}

function incomeGroupLabel(type: string): string {
  if (type === "Invoice") return "Invoices";
  if (type === "Load (not invoiced)") return "Loads delivered / in motion — not invoiced yet";
  if (type === "Factor advance") return "Factor advances";
  if (type === "Factor reserve") return "Factor reserves";
  return type;
}

const EMPTY_EXPENSE_TYPE: Record<(typeof V3_EXPENSE_GROUPS)[number], string> = {
  "finance & lease": "Loan payment",
  "driver bills": "Driver bill",
  diesel: "Diesel card payment",
  maintenance: "Maintenance bill",
  insurance: "Insurance installment",
  other: "Other operating",
};

function isBoardEmptyRow(row: RollingLedgerRow): boolean {
  return row.document_id.startsWith("__board_empty__");
}

function RowStatusPill({ row }: { row: RollingLedgerRow }) {
  if (isFactoringRow(row.type)) {
    return <span style={{ color: V3.muted }}>—</span>;
  }
  return <span>{row.status?.replace(/_/g, " ") ?? "—"}</span>;
}

function ensureExpenseGroupRows(rows: RollingLedgerRow[], dueDate: string): RollingLedgerRow[] {
  const present = new Set(rows.map(expenseGroupKey));
  const extras: RollingLedgerRow[] = [];
  for (const key of V3_EXPENSE_GROUPS) {
    if (present.has(key)) continue;
    extras.push({
      row_kind: "expense",
      type: EMPTY_EXPENSE_TYPE[key],
      document_kind: key === "driver bills" ? "driver_bill" : key === "finance & lease" ? "loan_amortization_row" : "bill",
      document_id: `__board_empty__${key.replace(/\W+/g, "_")}`,
      document_label: emptyExpenseHint(key),
      counterparty: emptyExpenseHint(key),
      origin_date: dueDate,
      due_date: dueDate,
      amount_cents: 0,
      days_overdue: 0,
      status: "due_today",
      amount_known: true,
    });
  }
  return [...rows, ...extras];
}

type CarriedAgg = { key: string; group: string; items: number; amount_cents: number };

function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  return addDaysIso(iso, delta);
}

/** Same priority buckets as Projected V3 (V3_EXPENSE_GROUPS). */
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

function expenseGroupLabel(key: (typeof V3_EXPENSE_GROUPS)[number], index: number): string {
  const titles: Record<(typeof V3_EXPENSE_GROUPS)[number], string> = {
    "finance & lease": "Finance & lease payments",
    "driver bills": "Driver bills — due on load delivery",
    diesel: "Diesel — card payments",
    maintenance: "Maintenance",
    insurance: "Insurance",
    other: "Other",
  };
  return `${index + 1} · ${titles[key]}`;
}

type DayGrain = "day" | "week";


// Banking's exact 28px (h-7) segmented-button pattern (BankingTransactionsDesignView.tsx's
// All/Spent/Received and By month/Money in/out/All dates toggles) — reused verbatim here for
// All/Income/Expenses and By day/By type.
function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  dataTestId,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  dataTestId?: string;
}) {
  return (
    <div
      className="inline-flex h-7 overflow-hidden rounded-sm text-xs"
      style={{ border: `1px solid ${V3.border}`, background: V3.surface, fontFamily: V3.font }}
      data-testid={dataTestId}
    >
      {options.map((opt, i) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            className="flex h-7 items-center px-2.5"
            style={{
              borderLeft: i !== 0 ? `1px solid ${V3.border}` : undefined,
              background: active ? V3.shell : "transparent",
              color: active ? V3.onShell : V3.muted,
              fontWeight: active ? 600 : 500,
              fontFamily: V3.font,
            }}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Banking's exact dropdown-button-with-chevron + checkbox-menu pattern (the "All transaction
// types" filter, BankingTransactionsDesignView.tsx lines ~3169-3227) — reused verbatim.
function TypeFilterDropdown({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="relative">
      <button
        type="button"
        className="flex h-7 min-w-[9rem] items-center justify-between gap-1 rounded-sm border border-[#E5E7EB] bg-white px-2 text-xs text-[#4B5563]"
        onClick={() => setOpen((o) => !o)}
        data-testid="rolling-ledger-type-filter"
      >
        {selected.length === 0 ? (
          <span>All transaction types</span>
        ) : (
          <span className="flex flex-wrap items-center gap-1">
            {selected.map((v) => {
              const label = options.find((o) => o.value === v)?.label ?? v;
              return (
                <span key={v} className="inline-flex items-center gap-1 rounded-sm bg-[#1F2A44] px-1.5 py-0.5 text-xs text-white">
                  {label}
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${label}`}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(v);
                    }}
                  >
                    ×
                  </span>
                </span>
              );
            })}
          </span>
        )}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-64 rounded-sm border border-[#E5E7EB] bg-white p-2 shadow-sm">
          {options.map((opt) => (
            <label key={opt.value} className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-xs text-[#4B5563] hover:bg-[#F7F8FA]">
              <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)} />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Day navigator card (owner: "as you design the load costs" — 64px card, ‹ / date / Today / ›).
// Restores the skeleton element that existed before this correction's toolbar rewrite.
function DayNavigatorCard({ date, today, onChange }: { date: string; today: string; onChange: (next: string) => void }) {
  const navBtn = {
    display: "flex" as const,
    height: 28,
    width: 28,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: 2,
    border: `1px solid ${V3.border}`,
    background: V3.surface,
    color: V3.muted,
    cursor: "pointer" as const,
  };
  return (
    <div
      className="flex h-16 items-center justify-center gap-3 rounded-sm px-3"
      style={{ border: `1px solid ${V3.border}`, background: V3.surface, fontFamily: V3.font }}
      data-testid="rolling-ledger-day-navigator"
    >
      <button type="button" onClick={() => onChange(addDaysIso(date, -1))} style={navBtn} aria-label="Previous day">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span style={{ fontSize: 12, fontWeight: 700, color: V3.ink }}>
        {fmtNavDate(date)}
        {date === today && <span style={{ marginLeft: 6, fontWeight: 400, color: V3.muted }}>· Today</span>}
      </span>
      <button type="button" onClick={() => onChange(addDaysIso(date, 1))} style={navBtn} aria-label="Next day">
        <ChevronRight className="h-4 w-4" />
      </button>
      {date !== today && (
        <button
          type="button"
          onClick={() => onChange(today)}
          style={{
            marginLeft: 4,
            borderRadius: 2,
            border: `1px solid ${V3.border}`,
            padding: "2px 8px",
            fontSize: 12,
            color: V3.muted,
            background: V3.surface,
            cursor: "pointer",
            fontFamily: V3.font,
          }}
        >
          Today
        </button>
      )}
    </div>
  );
}

// ROUND 16.7 CORRECTION — expense rows never get the multi-field AdjustPopover ("THE ADJUST
// EXPECTATION ... WILL ONLY COME IN EXPECTED INCOME SIDE"). A plain "Roll over ▾" reason menu
// (one click per catalog reason, next-day projection) replaces it.
function ExpenseRolloverMenu({
  reasons,
  onRollover,
  pending,
}: {
  reasons: CashFlowAdjustmentReason[];
  onRollover: (reasonCode: string) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const filtered = reasons.filter((r) => r.applies_to === "expense" || r.applies_to === "both");
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        disabled={pending}
        className="rounded-sm border border-[#E5E7EB] bg-white px-1.5 py-0.5 text-xs font-medium text-[#4B5563] hover:bg-[#F7F8FA] disabled:opacity-50"
        data-testid="rolling-ledger-expense-rollover-menu"
      >
        Roll over ▾
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-sm border border-[#E5E7EB] bg-white p-1 shadow-md" onClick={(e) => e.stopPropagation()}>
          {filtered.map((r) => (
            <button
              key={r.code}
              type="button"
              onClick={() => {
                onRollover(r.code);
                setOpen(false);
              }}
              className="block w-full rounded-sm px-2 py-1 text-left text-xs text-[#4B5563] hover:bg-[#F7F8FA]"
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ROUND 16.7 CORRECTION — a separate "Stop" action (no popup): one required-reason confirm, then
// hides the row from the snapshot (audited, same createCashFlowRowAdjustment hidden_reason path
// the income popover's "Stop showing here" checkbox already uses).
function StopTrackingButton({
  reasons,
  onStop,
  pending,
}: {
  reasons: CashFlowAdjustmentReason[];
  onStop: (reasonCode: string, hiddenReason: string) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const filtered = reasons.filter((r) => r.applies_to === "expense" || r.applies_to === "both");
  const [reasonCode, setReasonCode] = useState(filtered[0]?.code ?? "");
  const [hiddenReason, setHiddenReason] = useState("");
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        disabled={pending}
        className="rounded-sm border border-[#E5E7EB] bg-white px-1.5 py-0.5 text-xs font-medium text-[#4B5563] hover:bg-[#F7F8FA] disabled:opacity-50"
        data-testid="rolling-ledger-expense-stop"
      >
        Stop
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-sm border border-[#E5E7EB] bg-white p-2 shadow-md text-xs" onClick={(e) => e.stopPropagation()}>
          <SelectCombobox
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            className="mb-1 h-[26px] w-full rounded-sm border border-[#E5E7EB] px-1 text-xs"
          >
            {filtered.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </SelectCombobox>
          <input
            type="text"
            value={hiddenReason}
            onChange={(e) => setHiddenReason(e.target.value)}
            placeholder="Reason required (audited)"
            className="mb-1 h-[26px] w-full rounded-sm border border-[#E5E7EB] px-1 text-xs"
            data-testid="rolling-ledger-expense-stop-reason"
          />
          <button
            type="button"
            disabled={!hiddenReason.trim() || !reasonCode}
            onClick={() => {
              onStop(reasonCode, hiddenReason);
              setOpen(false);
              setHiddenReason("");
            }}
            className="w-full rounded-sm bg-[#1F2A44] px-2 py-1 text-xs font-medium text-white hover:bg-[#0F1219] disabled:opacity-50"
          >
            Confirm stop
          </button>
        </div>
      )}
    </div>
  );
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
function exportRowsCsv(rows: RollingLedgerRow[]): void {
  const header = ["Row", "Type", "Document", "Counterparty", "Origin date", "Due date", "Amount", "Days overdue", "Status", "Reason"];
  const body = rows.map((r) =>
    [
      r.row_kind,
      r.type,
      r.document_label,
      r.counterparty,
      r.origin_date,
      r.due_date,
      r.amount_known === false ? "UNKNOWN — awaiting short miles" : (r.amount_cents / 100).toFixed(2),
      String(r.days_overdue),
      r.status,
      r.reason_label ?? "",
    ]
      .map((v) => csvEscape(String(v)))
      .join(",")
  );
  const csv = [header.join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rolling-ledger-${companyToday()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type AdjustPopoverProps = {
  row: RollingLedgerRow;
  reasons: CashFlowAdjustmentReason[];
  applies: "income" | "expense";
  onClose: () => void;
  onSubmit: (input: { projectedDate: string | null; reasonCode: string; note: string; hide: boolean; hiddenReason: string }) => void;
  pending: boolean;
};

function AdjustPopover({ row, reasons, applies, onClose, onSubmit, pending }: AdjustPopoverProps) {
  const navigate = useNavigate();
  const filteredReasons = reasons.filter((r) => r.applies_to === applies || r.applies_to === "both");
  const [projectedDate, setProjectedDate] = useState(addDaysIso(row.due_date, 1));
  const [reasonCode, setReasonCode] = useState(filteredReasons[0]?.code ?? "");
  const [note, setNote] = useState("");
  const [hide, setHide] = useState(false);
  const [hiddenReason, setHiddenReason] = useState("");
  const ledgerKind = ledgerEntityKind(row.document_kind);
  const route = ledgerKind ? resolveEntityRoute(ledgerKind, row.document_id) : null;

  const canSave = hide ? hiddenReason.trim().length > 0 && reasonCode : reasonCode && projectedDate;

  return (
    <div className="rounded-sm border border-[#E5E7EB] bg-white p-3 text-xs shadow-md" data-testid="rolling-ledger-adjust-popover">
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#6B7280]">
        Adjust expectation · {row.document_label} · {row.counterparty} · {row.amount_known === false ? "Awaiting short miles" : formatCents(row.amount_cents || 0)} due {fmtDateShort(row.due_date)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#6B7280]">Projected date</span>
          <DatePicker value={projectedDate} onChange={setProjectedDate} min={row.due_date} disabled={hide} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#6B7280]">Reason (catalog)</span>
          <SelectCombobox
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            className="h-[26px] w-full rounded-sm border border-[#E5E7EB] px-2 text-xs"
          >
            {filteredReasons.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <label className="col-span-2 block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#6B7280]">Note</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="optional — who said what, when"
            className="h-[26px] w-full rounded-sm border border-[#E5E7EB] px-2 text-xs"
          />
        </label>
        {route && (
          <div className="col-span-2">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#6B7280]">Or record it</span>
            <button
              type="button"
              onClick={() => navigate(route)}
              className="rounded-sm border border-[#E5E7EB] bg-white px-2 py-1 text-xs text-[#4B5563] hover:bg-[#F7F8FA]"
            >
              Go to {row.document_label} to record the payment →
            </button>
          </div>
        )}
        <label className="col-span-2 flex items-center gap-2">
          <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} className="h-3.5 w-3.5" />
          <span className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Stop showing here</span>
        </label>
        {hide && (
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#6B7280]">Reason required (audited)</span>
            <input
              type="text"
              value={hiddenReason}
              onChange={(e) => setHiddenReason(e.target.value)}
              className="h-[26px] w-full rounded-sm border border-[#E5E7EB] px-2 text-xs"
              data-testid="rolling-ledger-hide-reason"
            />
          </label>
        )}
        <div className="col-span-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-sm border border-[#E5E7EB] bg-white px-3 py-1 text-xs text-[#4B5563] hover:bg-[#F7F8FA]">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave || pending}
            onClick={() =>
              onSubmit({ projectedDate: hide ? null : projectedDate, reasonCode, note, hide, hiddenReason })
            }
            className="rounded-sm bg-[#1F2A44] px-3 py-1 text-xs font-medium text-white hover:bg-[#0F1219] disabled:opacity-50"
            data-testid="rolling-ledger-adjust-save"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}


type Props = {
  operatingCompanyId: string;
};

export function RollingLedgerTab({ operatingCompanyId }: Props) {
  const { t } = useTranslation();
  const today = companyToday();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [preset, setPreset] = useState<DatePreset>("14d");
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [from, setFrom] = useState(searchParams.get("rl_from") || today);
  const [to, setTo] = useState(searchParams.get("rl_to") || addDaysIso(today, 13));

  const selectedTypes = useMemo(() => {
    const raw = searchParams.get("rl_types");
    return raw ? raw.split(",").filter(Boolean) : [];
  }, [searchParams]);
  const search = searchParams.get("rl_q") || "";
  const showRolledOver = searchParams.get("rl_rolled") !== "hide";
  const rowKindFilter = (searchParams.get("rl_kind") as "all" | "income" | "expenses") || "all";
  const groupMode = (searchParams.get("rl_group") as "day" | "type") || "day";
  const [selectedDate, setSelectedDate] = useState<string | null>(today);
  const [adjustingRowKey, setAdjustingRowKey] = useState<string | null>(null);
  const [dayGrain, setDayGrain] = useState<DayGrain>("day");

  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  };

  const queryKey = ["cash-flow-rolling-ledger", operatingCompanyId, from, to];
  const { data, isLoading, isError } = useQuery<RollingLedgerResult>({
    queryKey,
    queryFn: () => getRollingLedger(operatingCompanyId, from, to),
    enabled: !!operatingCompanyId && !!from && !!to && to >= from,
  });

  const { data: reasons = [] } = useQuery<CashFlowAdjustmentReason[]>({
    queryKey: ["cash-flow-adjustment-reasons"],
    queryFn: getCashFlowAdjustmentReasons,
    staleTime: 5 * 60 * 1000,
  });

  const adjustMutation = useMutation({
    mutationFn: (vars: {
      row: RollingLedgerRow;
      projectedDate: string | null;
      reasonCode: string;
      note: string;
      hiddenReason: string;
    }) =>
      createCashFlowRowAdjustment({
        operating_company_id: operatingCompanyId,
        document_kind: vars.row.document_kind,
        document_id: vars.row.document_id,
        original_due_date: vars.row.due_date,
        projected_due_date: vars.projectedDate,
        reason_code: vars.reasonCode,
        note: vars.note || null,
        hidden_reason: vars.hiddenReason || null,
      }),
    onSuccess: () => {
      setAdjustingRowKey(null);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const applyPreset = (p: DatePreset) => {
    setPreset(p);
    const range = presetRange(p, today);
    setFrom(range.from);
    setTo(range.to);
    setPresetMenuOpen(false);
  };

  const rowKeyOf = (row: RollingLedgerRow) => `${row.row_kind}-${row.document_kind}-${row.document_id}-${row.due_date}`;

  const allRows = useMemo(() => {
    if (!data) return [];
    let rows = data.rows;
    if (!showRolledOver) rows = rows.filter((r) => !r.reason_label);
    if (selectedTypes.length > 0) rows = rows.filter((r) => selectedTypes.includes(r.type));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => r.counterparty.toLowerCase().includes(q) || r.document_label.toLowerCase().includes(q));
    }
    return rows;
  }, [data, showRolledOver, selectedTypes, search]);

  const descriptionFilterOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: { value: string; label: string }[] = [];
    for (const r of data?.rows ?? []) {
      for (const label of [r.counterparty, r.document_label]) {
        if (!label || seen.has(label)) continue;
        seen.add(label);
        options.push({ value: label, label });
      }
    }
    return options.slice(0, 200);
  }, [data]);

  const focusDate = selectedDate ?? today;

  const incomeRows = useMemo(
    () =>
      allRows
        .filter((r) => r.row_kind === "income" && (!selectedDate || r.due_date === selectedDate))
        .sort((a, b) => (a.due_date < b.due_date ? -1 : 1)),
    [allRows, selectedDate]
  );
  const incomeCarriedRows = useMemo(() => {
    return allRows
      .filter((r) => r.row_kind === "income" && r.due_date < focusDate && !r.is_rollover_echo)
      .sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  }, [allRows, focusDate]);
  const expenseRowsDue = useMemo(() => {
    return allRows
      .filter((r) => r.row_kind === "expense" && r.due_date === focusDate)
      .sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  }, [allRows, focusDate]);
  const expenseRowsForTable = useMemo(
    () => ensureExpenseGroupRows(expenseRowsDue, focusDate),
    [expenseRowsDue, focusDate]
  );
  const expenseCarriedRows = useMemo(() => {
    return allRows
      .filter((r) => r.row_kind === "expense" && r.due_date < focusDate && !r.is_rollover_echo)
      .sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  }, [allRows, focusDate]);

  const incomeCarriedAgg = useMemo((): CarriedAgg[] => {
    const buckets = new Map<string, CarriedAgg>();
    for (const r of incomeCarriedRows) {
      const group =
        r.type === "Invoice"
          ? "Invoices past due"
          : r.type === "Load (not invoiced)"
            ? "Loads past delivery — not invoiced"
            : r.type === "Factor advance"
              ? "Factor advances past due"
              : `${r.type} past due`;
      const cur = buckets.get(group) ?? { key: group, group, items: 0, amount_cents: 0 };
      cur.items += 1;
      cur.amount_cents += r.amount_cents;
      buckets.set(group, cur);
    }
    return [...buckets.values()].sort((a, b) => b.amount_cents - a.amount_cents);
  }, [incomeCarriedRows]);

  const expenseCarriedAgg = useMemo((): CarriedAgg[] => {
    const buckets = new Map<string, CarriedAgg>();
    for (const r of expenseCarriedRows) {
      const gkey = expenseGroupKey(r);
      const group =
        gkey === "driver bills"
          ? "Driver bills past delivery date"
          : gkey === "finance & lease"
            ? "Finance & lease past due"
            : gkey === "diesel"
              ? "Diesel card payments past due"
              : r.type === "Bill" || r.document_kind === "bill"
                ? "Vendor bills (no due date)"
                : `${incomeGroupLabel(r.type)} past due`;
      const cur = buckets.get(group) ?? { key: group, group, items: 0, amount_cents: 0 };
      cur.items += 1;
      cur.amount_cents += r.amount_cents;
      buckets.set(group, cur);
    }
    return [...buckets.values()].sort((a, b) => b.amount_cents - a.amount_cents);
  }, [expenseCarriedRows]);

  const dayGridRows = useMemo(() => {
    if (!data) return [] as RollingLedgerDay[];
    const active = data.days.filter(
      (d) =>
        d.income_due_cents !== 0 ||
        d.expenses_due_cents !== 0 ||
        d.income_carry_over_cents !== 0 ||
        d.expenses_carry_over_cents !== 0 ||
        d.net_cents !== 0
    );
    if (dayGrain === "day") return active;
    const byWeek = new Map<string, RollingLedgerDay>();
    for (const day of active) {
      const weekStart = mondayOf(day.date);
      const cur = byWeek.get(weekStart);
      if (!cur) {
        byWeek.set(weekStart, { ...day, date: weekStart });
        continue;
      }
      byWeek.set(weekStart, {
        ...cur,
        income_due_cents: cur.income_due_cents + day.income_due_cents,
        expenses_due_cents: cur.expenses_due_cents + day.expenses_due_cents,
        income_carry_over_cents: cur.income_carry_over_cents + day.income_carry_over_cents,
        expenses_carry_over_cents: cur.expenses_carry_over_cents + day.expenses_carry_over_cents,
        net_cents: cur.net_cents + day.net_cents,
        running_cash_cents: day.running_cash_cents ?? cur.running_cash_cents,
      });
    }
    return [...byWeek.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [data, dayGrain]);

  const adjustingRow = useMemo(() => {
    if (!adjustingRowKey) return null;
    return allRows.find((r) => rowKeyOf(r) === adjustingRowKey) ?? null;
  }, [allRows, adjustingRowKey]);
  const adjustingRowIsIncome = adjustingRow?.row_kind === "income";

  const boardKpis = useMemo(() => {
    if (!data) return null;
    const day = data.days.find((d) => d.date === focusDate) ?? data.days[0];
    const incomeDue = incomeRows.reduce((s, r) => s + r.amount_cents, 0);
    const expensesDue = expenseRowsDue.reduce((s, r) => s + r.amount_cents, 0);
    const net = incomeDue - expensesDue;
    const dueNext10 = allRows
      .filter((r) => r.row_kind === "income" && r.due_date >= today && r.due_date <= addDaysIso(today, 10))
      .reduce((s, r) => s + r.amount_cents, 0);
    const driverBillCount = expenseRowsDue.filter((r) => expenseGroupKey(r) === "driver bills").length;
    return {
      opening: data.opening_cash_cents,
      incomeDue,
      incomeCount: incomeRows.length,
      expensesDue,
      expenseSub:
        driverBillCount > 0
          ? `${driverBillCount} driver bill${driverBillCount === 1 ? "" : "s"}`
          : `${expenseRowsDue.length} item${expenseRowsDue.length === 1 ? "" : "s"}`,
      net,
      projectedClosing: day?.running_cash_cents ?? null,
      dueNext10,
    };
  }, [data, focusDate, incomeRows, expenseRowsDue, allRows, today]);

  const incomeColumns: ParityColumn<RollingLedgerRow>[] = [
    {
      key: "party",
      label: "Party",
      sortable: true,
      render: (row) => {
        if (row.customer_id) {
          return <EntityLink kind="customer" id={row.customer_id} label={row.customer_name || row.counterparty} onClick={(e) => e.stopPropagation()} />;
        }
        return <span>{row.counterparty || "—"}</span>;
      },
      sortValue: (row) => row.counterparty,
    },
    {
      // key "load" kept for verify-settlement-ref-beside-load (ALL-SEATS law); board label is Doc / load.
      key: "load",
      label: "Doc / load",
      render: (row) => {
        const kind = ledgerEntityKind(row.document_kind);
        const doc = kind ? (
          <EntityLink kind={kind} id={row.document_id} label={row.document_label} onClick={(e) => e.stopPropagation()} />
        ) : (
          <span>{row.document_label}</span>
        );
        const load = row.load_id ? (
          <>
            {" · "}
            <EntityLink kind="load" id={row.load_id} label={row.load_number ?? row.load_id} onClick={(e) => e.stopPropagation()} />
          </>
        ) : null;
        return (
          <span>
            {doc}
            {load}
          </span>
        );
      },
    },
    {
      key: "settlement_reference",
      label: "Settlement / Presettlement",
      testId: "settlement-reference-column",
      render: (row) =>
        row.load_id ? (
          <SettlementRefCell loadId={row.load_id} operatingCompanyId={operatingCompanyId} />
        ) : (
          <span style={{ color: V3.muted }}>—</span>
        ),
    },
    {
      key: "due_date",
      label: "Due",
      sortable: true,
      render: (row) => {
        if (isFactoringRow(row.type)) {
          return <span>—</span>;
        }
        return <span>{row.days_overdue > 0 ? `${row.days_overdue}d overdue` : row.days_overdue === 0 ? "Due today" : `In ${-row.days_overdue}d`}</span>;
      },
      sortValue: (row) => row.due_date,
    },
    {
      key: "invoice_date",
      label: "Invoice date",
      render: (row) => fmtDateShort(row.origin_date),
    },
    {
      key: "days",
      label: "Days",
      render: (row) => (row.days_overdue > 0 ? `${row.days_overdue}d overdue` : row.days_overdue === 0 ? "Due today" : `In ${-row.days_overdue}d`),
    },
    {
      key: "status",
      label: "Status",
      render: (row) => <RowStatusPill row={row} />,
    },
    {
      key: "amount_cents",
      label: "Amount",
      className: "text-right",
      cellClass: "text-right font-mono font-medium",
      kind: "money",
      render: (row) =>
        row.amount_known === false ? "Awaiting short miles" : formatCents(row.amount_cents),
    },
  ];

  const expenseColumns: ParityColumn<RollingLedgerRow>[] = [
    {
      key: "payee",
      label: "Payee",
      sortable: true,
      render: (row) => {
        if (isBoardEmptyRow(row)) {
          return <span style={{ color: V3.slate }}>{row.counterparty}</span>;
        }
        return <span>{row.counterparty || "—"}</span>;
      },
      sortValue: (row) => row.counterparty,
    },
    {
      key: "load",
      label: "Doc / load",
      render: (row) => {
        if (isBoardEmptyRow(row)) return null;
        const kind = ledgerEntityKind(row.document_kind);
        const doc = kind ? (
          <EntityLink kind={kind} id={row.document_id} label={row.document_label} onClick={(e) => e.stopPropagation()} />
        ) : (
          <span>{row.document_label}</span>
        );
        const load = row.load_id ? (
          <>
            {" · "}
            <EntityLink kind="load" id={row.load_id} label={row.load_number ?? row.load_id} onClick={(e) => e.stopPropagation()} />
          </>
        ) : null;
        return (
          <span>
            {doc}
            {load}
          </span>
        );
      },
    },
    {
      key: "settlement_reference",
      label: "Settlement / Presettlement",
      testId: "settlement-reference-column",
      render: (row) =>
        isBoardEmptyRow(row) ? null : row.load_id ? (
          <SettlementRefCell loadId={row.load_id} operatingCompanyId={operatingCompanyId} />
        ) : (
          <span style={{ color: V3.muted }}>—</span>
        ),
    },
    {
      key: "due_date",
      label: "Due",
      sortable: true,
      render: (row) => (isBoardEmptyRow(row) ? null : <span>{row.days_overdue > 0 ? `${row.days_overdue}d overdue` : row.days_overdue === 0 ? "Due today" : `In ${-row.days_overdue}d`}</span>),
      sortValue: (row) => row.due_date,
    },
    {
      key: "amount_cents",
      label: "Amount",
      className: "text-right",
      cellClass: "text-right font-mono font-medium",
      kind: "money",
      render: (row) => (isBoardEmptyRow(row) ? null : row.amount_known === false ? "Awaiting short miles" : formatCents(row.amount_cents)),
    },
    {
      key: "days",
      label: "Days",
      render: (row) => {
        if (isBoardEmptyRow(row)) return null;
        return row.days_overdue > 0 ? `${row.days_overdue}d overdue` : row.days_overdue === 0 ? "Due today" : `In ${-row.days_overdue}d`;
      },
    },
    {
      key: "action",
      label: "Action",
      sortable: false,
      render: (row) => {
        if (isBoardEmptyRow(row)) return null;
        return (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <ExpenseRolloverMenu
              reasons={reasons}
              pending={adjustMutation.isPending}
              onRollover={(reasonCode) =>
                adjustMutation.mutate({ row, projectedDate: addDaysIso(row.due_date, 1), reasonCode, note: "", hiddenReason: "" })
              }
            />
            <StopTrackingButton
              reasons={reasons}
              pending={adjustMutation.isPending}
              onStop={(reasonCode, hiddenReason) =>
                adjustMutation.mutate({ row, projectedDate: null, reasonCode, note: "", hiddenReason })
              }
            />
          </div>
        );
      },
    },
  ];

  const carriedColumns: ParityColumn<CarriedAgg>[] = [
    { key: "group", label: "Group", render: (row) => row.group },
    {
      key: "items",
      label: "Items",
      className: "text-right",
      cellClass: "text-right",
      kind: "number",
      render: (row) => String(row.items),
    },
    {
      key: "amount_cents",
      label: "Amount",
      className: "text-right",
      cellClass: "text-right font-mono font-medium",
      kind: "money",
      render: (row) => formatCents(row.amount_cents),
    },
  ];

  const dayGridColumns: ParityColumn<RollingLedgerDay>[] = [
    {
      key: "date",
      label: "Date",
      render: (day) => (
        <>
          {dayGrain === "week" ? `Week of ${fmtChipDate(day.date)}` : fmtChipDate(day.date)}
          {day.date === today && dayGrain === "day" && (
            <span className="ml-1 text-xs" style={{ color: V3.muted }}>
              (today)
            </span>
          )}
        </>
      ),
    },
    {
      key: "income_due_cents",
      label: "Income",
      sortable: true,
      className: "text-right",
      cellClass: "text-right",
      kind: "money",
      render: (day) => (day.income_due_cents === 0 ? "—" : formatCents(day.income_due_cents)),
    },
    {
      key: "expenses_due_cents",
      label: "Expenses",
      sortable: true,
      className: "text-right",
      cellClass: "text-right",
      kind: "money",
      render: (day) => (day.expenses_due_cents === 0 ? "—" : formatCents(day.expenses_due_cents)),
    },
    {
      key: "net_cents",
      label: "Net",
      className: "text-right",
      cellClass: "text-right",
      kind: "money",
      render: (day) =>
        day.net_cents === 0 ? (
          "—"
        ) : (
          <span style={{ color: day.net_cents > 0 ? V3.green : V3.ink, fontWeight: 600 }}>
            {formatCents(day.net_cents, { sign: true })}
          </span>
        ),
    },
    {
      key: "running_cash_cents",
      label: "Running cash",
      className: "text-right",
      cellClass: "text-right font-medium",
      kind: "money",
      render: (day) => (day.running_cash_cents === null ? "—" : <b>{formatCents(day.running_cash_cents)}</b>),
    },
  ];

  const unknownAmountCount = data?.rows.filter((row) => row.amount_known === false).length ?? 0;
  const selectedLabel = fmtNavDate(focusDate);
  const expensePriorityGroupBy = {
    getKey: (row: RollingLedgerRow) => expenseGroupKey(row),
    renderHeader: (key: string, rows: RollingLedgerRow[]) => {
      const idx = (V3_EXPENSE_GROUPS as readonly string[]).indexOf(key);
      const label = idx >= 0 ? expenseGroupLabel(V3_EXPENSE_GROUPS[idx], idx) : key;
      const realRows = rows.filter((r) => !isBoardEmptyRow(r));
      const total = realRows.reduce((s, r) => s + r.amount_cents, 0);
      return (
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em", color: V3.ink }}>
          {label}
          <span style={{ float: "right", fontVariantNumeric: "tabular-nums" }}>{formatCents(total)}</span>
        </span>
      );
    },
    orderedKeys: [...V3_EXPENSE_GROUPS],
  };
  const incomeTypeGroupBy = {
    getKey: (row: RollingLedgerRow) => row.type,
    renderHeader: (key: string, rows: RollingLedgerRow[]) => (
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em", color: V3.ink }}>
        {incomeGroupLabel(key)}
        <span style={{ float: "right", fontVariantNumeric: "tabular-nums" }}>
          {formatCents(rows.reduce((s, r) => s + r.amount_cents, 0))}
        </span>
      </span>
    ),
    orderedKeys: ["Invoice", "Factor advance", "Factor reserve", "Load (not invoiced)"],
  };
  const toolbarBtn: CSSProperties = {
    display: "flex",
    height: 28,
    alignItems: "center",
    gap: 4,
    borderRadius: 2,
    border: `1px solid ${V3.border}`,
    background: V3.surface,
    padding: "0 12px",
    fontSize: 12,
    fontWeight: 600,
    color: V3.ink,
    fontFamily: V3.font,
    cursor: "pointer",
  };
  const dateRangeLabel = `${fmtNavDate(from).replace(/^\w+, /, "")} – ${fmtNavDate(to).replace(/^\w+, /, "")}`;

  return (
    <div className="space-y-3" data-testid="cash-flow-rolling-ledger-tab" style={{ fontFamily: V3.font }}>
      {unknownAmountCount > 0 && (
        <p role="status">{t("cashFlow.unknownDriverCosts", undefined, { count: unknownAmountCount })}</p>
      )}

      {/* Board chrome: Filters ▾ · Date · By day|By type · day nav · Export. Banking contracts expand under Filters. */}
      <div
        className="flex flex-wrap items-center gap-2"
        style={{ fontFamily: V3.font }}
        data-testid="rolling-ledger-v3-filters"
      >
        <button type="button" onClick={() => setFiltersOpen((o) => !o)} style={toolbarBtn} data-testid="rolling-ledger-filters-toggle">
          Filters <ChevronDown className="h-3 w-3" />
        </button>
        <span style={{ fontSize: 11, color: V3.muted }}>Date: {dateRangeLabel}</span>
        <SegmentedControl
          options={[
            { value: "day" as const, label: "By day" },
            { value: "type" as const, label: "By type" },
          ]}
          value={groupMode}
          onChange={(next) => updateParams({ rl_group: next === "day" ? null : next })}
          dataTestId="rolling-ledger-group-mode"
        />
        <span className="flex-1" />
        <DayNavigatorCard date={focusDate} today={today} onChange={(next) => setSelectedDate(next)} />
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => exportRowsCsv(allRows)}
          disabled={allRows.length === 0}
          style={{ ...toolbarBtn, opacity: allRows.length === 0 ? 0.5 : 1 }}
          data-testid="rolling-ledger-export"
        >
          Export
        </button>
      </div>

      {filtersOpen && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-sm p-2"
          style={{ border: `1px solid ${V3.border}`, background: V3.surface }}
          data-testid="rolling-ledger-filters-panel"
        >
          <div className="h-7 w-[242px]">
            <Combobox
              options={descriptionFilterOptions}
              value={search || null}
              onChange={(next) => updateParams({ rl_q: next || null })}
              onSearch={(q) => updateParams({ rl_q: q || null })}
              allowClear
              placeholder="Filter by description"
              dataTestId="rolling-ledger-description-filter"
            />
          </div>
          <SegmentedControl
            options={[
              { value: "all" as const, label: "All" },
              { value: "income" as const, label: "Income" },
              { value: "expenses" as const, label: "Expenses" },
            ]}
            value={rowKindFilter}
            onChange={(next) => updateParams({ rl_kind: next === "all" ? null : next })}
            dataTestId="rolling-ledger-kind-filter"
          />
          <div className="flex h-7 items-center gap-1">
            <label htmlFor="rolling-ledger-from" className="text-xs font-bold uppercase" style={{ color: V3.muted }}>
              From
            </label>
            <DatePicker
              id="rolling-ledger-from"
              value={from}
              onChange={(v) => {
                setFrom(v);
                updateParams({ rl_from: v });
              }}
              max={to}
              className="h-7 w-[128px]"
              data-testid="rolling-ledger-from"
            />
            <label htmlFor="rolling-ledger-to" className="text-xs font-bold uppercase" style={{ color: V3.muted }}>
              To
            </label>
            <DatePicker
              id="rolling-ledger-to"
              value={to}
              onChange={(v) => {
                setTo(v);
                updateParams({ rl_to: v });
              }}
              min={from}
              className="h-7 w-[128px]"
              data-testid="rolling-ledger-to"
            />
            <div className="relative">
              <button type="button" onClick={() => setPresetMenuOpen((o) => !o)} style={{ ...toolbarBtn, fontWeight: 500, color: V3.muted }} data-testid="rolling-ledger-presets">
                Presets <ChevronDown className="h-3 w-3" />
              </button>
              {presetMenuOpen && (
                <div
                  className="absolute left-0 top-full z-10 mt-1 w-40 p-1 shadow-md"
                  style={{ background: V3.surface, border: `1px solid ${V3.border}`, borderRadius: 2 }}
                >
                  {PRESET_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => applyPreset(opt.value)}
                      className="block w-full rounded-sm px-2 py-1 text-left text-xs"
                      style={{
                        background: preset === opt.value ? V3.headerBg : "transparent",
                        color: preset === opt.value ? V3.ink : V3.muted,
                        fontWeight: preset === opt.value ? 600 : 400,
                        fontFamily: V3.font,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <TypeFilterDropdown
            options={TYPE_OPTIONS}
            selected={selectedTypes}
            onChange={(next) => updateParams({ rl_types: next.length > 0 ? next.join(",") : null })}
          />
          <button
            type="button"
            onClick={() => updateParams({ rl_rolled: showRolledOver ? "hide" : null })}
            style={{ ...toolbarBtn, fontWeight: 500, color: V3.muted }}
            data-testid="rolling-ledger-rolled-toggle"
          >
            Rolled over: <b>{showRolledOver ? "show" : "hide"}</b>
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
      )}

      {isLoading && (
        <div className="rounded-sm p-6 text-center text-xs" style={{ border: `1px solid ${V3.border}`, background: V3.surface, color: V3.muted }}>
          Loading…
        </div>
      )}
      {isError && (
        <div className="rounded-sm p-6 text-center text-xs" style={{ border: `1px solid ${V3.border}`, background: V3.headerBg, color: V3.muted }}>
          Failed to load the rolling ledger. Please try again.
        </div>
      )}

      {data && boardKpis && (
        <>
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8 }}
            data-testid="rolling-ledger-v3-kpis"
          >
            <V3KpiTile
              label="Opening cash"
              value={boardKpis.opening === null ? "—" : formatUsdCents(boardKpis.opening)}
              testId="rolling-ledger-v3-kpi-opening"
            />
            <V3KpiTile
              label="Income due today"
              value={formatUsdCents(boardKpis.incomeDue)}
              sub={`${boardKpis.incomeCount} item${boardKpis.incomeCount === 1 ? "" : "s"}`}
              testId="rolling-ledger-v3-kpi-income"
            />
            <V3KpiTile
              label="Expenses due today"
              value={formatUsdCents(boardKpis.expensesDue)}
              sub={boardKpis.expenseSub}
              testId="rolling-ledger-v3-kpi-expenses"
            />
            <V3KpiTile
              label="Net today"
              value={formatCents(boardKpis.net, { sign: true })}
              tone={boardKpis.net > 0 ? "green" : boardKpis.net < 0 ? "red" : "ink"}
              sub="None"
              testId="rolling-ledger-v3-kpi-net"
            />
            <V3KpiTile
              label="Projected closing"
              value={boardKpis.projectedClosing === null ? "—" : formatUsdCents(boardKpis.projectedClosing)}
              testId="rolling-ledger-v3-kpi-closing"
            />
            <V3KpiTile
              label="Due next 10 days"
              value={formatUsdCents(boardKpis.dueNext10)}
              testId="rolling-ledger-v3-kpi-due10"
            />
          </div>

          <div
            className={`grid grid-cols-1 gap-3 ${
              rowKindFilter === "all" ? "xl:grid-cols-2" : "xl:grid-cols-1"
            }`}
          >
            {rowKindFilter !== "expenses" && (
              <BoardSection
                title={`Income · ${selectedLabel}`}
                subtitle={`${incomeRows.length} item${incomeRows.length === 1 ? "" : "s"}`}
                onViewAll={() => setSelectedDate(null)}
                testId="rolling-ledger-income-panel"
              >
                <ParityTable
                  rows={incomeRows}
                  columns={incomeColumns}
                  rowKey={rowKeyOf}
                  storageKey="cash-flow-income-v3"
                  emptyText="No expected income for this day."
                  onRowClick={(row) => setAdjustingRowKey(adjustingRowKey === rowKeyOf(row) ? null : rowKeyOf(row))}
                  groupBy={incomeTypeGroupBy}
                  data-testid="rolling-ledger-income-table"
                />
                {adjustingRow && adjustingRowIsIncome && (
                  <div className="p-2" style={{ borderTop: `1px solid ${V3.border}` }}>
                    <AdjustPopover
                      row={adjustingRow}
                      reasons={reasons}
                      applies="income"
                      onClose={() => setAdjustingRowKey(null)}
                      pending={adjustMutation.isPending}
                      onSubmit={({ projectedDate, reasonCode, note, hiddenReason }) =>
                        adjustMutation.mutate({ row: adjustingRow, projectedDate, reasonCode, note, hiddenReason })
                      }
                    />
                  </div>
                )}
              </BoardSection>
            )}

            {rowKindFilter !== "income" && (
              <BoardSection
                title={`Expenses · ${selectedLabel}`}
                subtitle="payment priority order"
                onViewAll={() => setSelectedDate(null)}
                testId="rolling-ledger-expense-panel"
              >
                <ParityTable
                  rows={expenseRowsForTable}
                  columns={expenseColumns}
                  rowKey={rowKeyOf}
                  storageKey="cash-flow-expenses-v3"
                  emptyText="No expected expenses due this day."
                  groupBy={expensePriorityGroupBy}
                  data-testid="rolling-ledger-expense-table"
                />
              </BoardSection>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {(rowKindFilter === "all" || rowKindFilter === "income") && (
              <BoardSection
                title="Carried income — past due, not received"
                onViewAll={() => {
                  setSelectedDate(null);
                  updateParams({ rl_kind: "income" });
                }}
                testId="rolling-ledger-carried-income-panel"
              >
                <ParityTable
                  rows={incomeCarriedAgg}
                  columns={carriedColumns}
                  rowKey={(r) => r.key}
                  storageKey="cash-flow-income-carried-v3"
                  emptyText="No carried income."
                  data-testid="rolling-ledger-carried-income-table"
                />
              </BoardSection>
            )}

            {(rowKindFilter === "all" || rowKindFilter === "expenses") && (
              <BoardSection
                title="Carried expenses — past due, not paid"
                footer="Card fuel fills are not carried — the card payment is."
                onViewAll={() => {
                  setSelectedDate(null);
                  updateParams({ rl_kind: "expenses" });
                }}
                testId="rolling-ledger-carried-expense-panel"
              >
                <ParityTable
                  rows={expenseCarriedAgg}
                  columns={carriedColumns}
                  rowKey={(r) => r.key}
                  storageKey="cash-flow-expenses-carried-v3"
                  emptyText="No carried expenses."
                  data-testid="rolling-ledger-carried-expense-table"
                />
              </BoardSection>
            )}
          </div>

          <BoardSection
            title={`Day grid · ${fmtChipDate(from)} → ${fmtChipDate(to)} (days with activity)`}
            headerRight={
              <V3Segmented
                value={dayGrain}
                options={[
                  { id: "day", label: "Day" },
                  { id: "week", label: "Week" },
                ]}
                onChange={setDayGrain}
                testId="rolling-ledger-day-grain"
              />
            }
            footer="Click a day → both sides above switch to that day."
            testId="rolling-ledger-day-grid-panel"
          >
            <ParityTable
              rows={dayGridRows}
              columns={dayGridColumns}
              rowKey={(day) => day.date}
              storageKey="cash-flow-day-grid-v3"
              emptyText="No days with activity in this range."
              rowClassName={(day) =>
                `${day.date === today ? "font-medium" : ""} ${day.date === selectedDate ? "" : ""} ${day.date < today ? "opacity-80" : ""}`
              }
              onRowClick={(day) => setSelectedDate(day.date === selectedDate ? today : day.date)}
              data-testid="rolling-ledger-day-grid"
            />
          </BoardSection>
        </>
      )}
    </div>
  );
}
