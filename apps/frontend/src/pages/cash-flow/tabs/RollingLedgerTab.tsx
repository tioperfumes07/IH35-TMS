import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Settings } from "lucide-react";
import {
  getRollingLedger,
  getCashFlowAdjustmentReasons,
  createCashFlowRowAdjustment,
  type RollingLedgerResult,
  type RollingLedgerRow,
  type CashFlowAdjustmentReason,
} from "../../../api/cashFlow";
import { addDaysIso, companyToday } from "../../../lib/businessDate";
import { formatUsdCents } from "../../../lib/money";
import { EntityLink, resolveEntityRoute } from "../../../components/shared/EntityLink";
import { DatePicker } from "../../../components/forms/DatePicker";
import { MultiSelectDropdown } from "../../../components/forms/MultiSelectDropdown";

// CASH-FLOW-02 (owner order 2026-09-06 20:1x/20:2x/20:5xZ). A daily snapshot with roll-over:
// every expected dollar carries its own due date and stays until paid/matched. Owner-corrected
// layout (20:5xZ): compact 8-tile KPI strip, LEFT Expected Income (38%) / RIGHT Expected Expenses
// (62%) split, day grid below, a Banking-style always-visible From/To date filter (not a
// collapsed preset picker), and a click-to-adjust pop-up on any row (Projected date, a real
// reason catalog, a note, a "Record it" link to the row's own real detail/payment surface, and an
// audited "Stop showing here").

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
  const base = new Date(today + "T00:00:00");
  if (preset === "7d") return { from: today, to: addDaysIso(today, 6) };
  if (preset === "14d") return { from: today, to: addDaysIso(today, 13) };
  if (preset === "30d") return { from: today, to: addDaysIso(today, 29) };
  if (preset === "this_month") {
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }
  const start = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 2, 0);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

type IncomeColumnKey = "type" | "counterparty" | "load" | "dueCol" | "in" | "amount" | "status";
type ExpenseColumnKey = "type" | "no" | "name" | "period" | "dueCol" | "days" | "amount" | "status" | "reason" | "action";

const INCOME_COLUMN_LABELS: Record<IncomeColumnKey, string> = {
  type: "Type",
  counterparty: "Customer · No.",
  load: "Load",
  dueCol: "Due",
  in: "In",
  amount: "Expected",
  status: "Status",
};
const ALL_INCOME_COLUMNS = Object.keys(INCOME_COLUMN_LABELS) as IncomeColumnKey[];

const EXPENSE_COLUMN_LABELS: Record<ExpenseColumnKey, string> = {
  type: "Type",
  no: "No.",
  name: "Name",
  period: "Period",
  dueCol: "Due",
  days: "Days",
  amount: "Amount",
  status: "Status",
  reason: "Reason / source",
  action: "Action",
};
const ALL_EXPENSE_COLUMNS = Object.keys(EXPENSE_COLUMN_LABELS) as ExpenseColumnKey[];

function formatCents(cents: number, opts?: { sign?: boolean }): string {
  const abs = Math.abs(cents);
  const dollars = formatUsdCents(abs);
  if (opts?.sign && cents < 0) return `−${dollars}`;
  if (opts?.sign && cents > 0) return `+${dollars}`;
  return cents < 0 ? `−${dollars}` : dollars;
}

function fmtDateShort(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}
function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const STATUS_LABEL: Record<RollingLedgerRow["status"], string> = {
  overdue: "Overdue",
  due_today: "Due today",
  upcoming: "Open",
};

// §7 palette law — financial UI never uses amber/warning colors, even for an overdue signal.
const STATUS_CLASS: Record<RollingLedgerRow["status"], string> = {
  overdue: "border-slate-300 bg-slate-200 text-slate-800 font-semibold",
  due_today: "border-slate-200 bg-slate-100 text-slate-700",
  upcoming: "border-slate-200 bg-white text-slate-500",
};

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
      (r.amount_cents / 100).toFixed(2),
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

function GearMenu<K extends string>({
  columns,
  labels,
  visible,
  onToggle,
}: {
  columns: K[];
  labels: Record<K, string>;
  visible: Set<K>;
  onToggle: (key: K) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-sm border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
        aria-label="Columns"
      >
        <Settings className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-sm border border-slate-200 bg-white p-2 text-left shadow-md">
          {columns.map((key) => (
            <label key={key} className="flex items-center gap-2 rounded-sm px-2 py-1 text-xs font-normal normal-case text-slate-700 hover:bg-slate-50">
              <input type="checkbox" checked={visible.has(key)} onChange={() => onToggle(key)} className="h-3.5 w-3.5" />
              {labels[key]}
            </label>
          ))}
        </div>
      )}
    </div>
  );
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
  const route = resolveEntityRoute(row.document_kind, row.document_id);

  const canSave = hide ? hiddenReason.trim().length > 0 && reasonCode : reasonCode && projectedDate;

  return (
    <div className="col-span-full my-1 rounded-sm border border-slate-400 bg-white p-3 text-xs shadow-md" data-testid="rolling-ledger-adjust-popover">
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">
        Adjust expectation · {row.document_label} · {row.counterparty} · {formatCents(row.amount_cents || 0)} due {fmtDateShort(row.due_date)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Projected date</span>
          <DatePicker value={projectedDate} onChange={setProjectedDate} min={row.due_date} disabled={hide} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Reason (catalog)</span>
          <select
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            className="h-[26px] w-full rounded-sm border border-slate-300 px-2 text-xs"
          >
            {filteredReasons.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Note</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="optional — who said what, when"
            className="h-[26px] w-full rounded-sm border border-slate-300 px-2 text-xs"
          />
        </label>
        {route && (
          <div className="col-span-2">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Or record it</span>
            <button
              type="button"
              onClick={() => navigate(route)}
              className="rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              Go to {row.document_label} to record the payment →
            </button>
          </div>
        )}
        <label className="col-span-2 flex items-center gap-2">
          <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} className="h-3.5 w-3.5" />
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Stop showing here</span>
        </label>
        {hide && (
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Reason required (audited)</span>
            <input
              type="text"
              value={hiddenReason}
              onChange={(e) => setHiddenReason(e.target.value)}
              className="h-[26px] w-full rounded-sm border border-slate-300 px-2 text-xs"
              data-testid="rolling-ledger-hide-reason"
            />
          </label>
        )}
        <div className="col-span-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-sm border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave || pending}
            onClick={() =>
              onSubmit({ projectedDate: hide ? null : projectedDate, reasonCode, note, hide, hiddenReason })
            }
            className="rounded-sm bg-slate-800 px-3 py-1 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
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
  const today = companyToday();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [preset, setPreset] = useState<DatePreset>("14d");
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [from, setFrom] = useState(searchParams.get("rl_from") || today);
  const [to, setTo] = useState(searchParams.get("rl_to") || addDaysIso(today, 13));

  const selectedTypes = useMemo(() => {
    const raw = searchParams.get("rl_types");
    return raw ? raw.split(",").filter(Boolean) : [];
  }, [searchParams]);
  const search = searchParams.get("rl_q") || "";
  const showRolledOver = searchParams.get("rl_rolled") !== "hide";
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [adjustingRowKey, setAdjustingRowKey] = useState<string | null>(null);
  const [incomeColumns, setIncomeColumns] = useState<Set<IncomeColumnKey>>(new Set(ALL_INCOME_COLUMNS));
  const [expenseColumns, setExpenseColumns] = useState<Set<ExpenseColumnKey>>(
    new Set(ALL_EXPENSE_COLUMNS.filter((c) => c !== "action" || true))
  );

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

  const incomeRows = useMemo(
    () => allRows.filter((r) => r.row_kind === "income" && (!selectedDate || r.due_date === selectedDate)).sort((a, b) => (a.due_date < b.due_date ? -1 : 1)),
    [allRows, selectedDate]
  );
  const expenseRowsToday = useMemo(() => {
    const targetDate = selectedDate ?? today;
    return allRows
      .filter((r) => r.row_kind === "expense" && r.due_date <= targetDate)
      .sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  }, [allRows, selectedDate, today]);

  const kpis = useMemo(() => {
    if (!data) return null;
    const todayDay = data.days.find((d) => d.date === today) ?? data.days[0];
    const incomeNotFactored = allRows
      .filter((r) => r.type === "Invoice")
      .reduce((s, r) => s + r.amount_cents, 0);
    const dueNext10 = allRows
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
  }, [data, allRows, today]);


  return (
    <div className="space-y-3" data-testid="cash-flow-rolling-ledger-tab">
      {/* Banking-style date filter: From/To always visible, Presets is a convenience shortcut. */}
      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-slate-200 bg-white p-2">
        <div className="flex items-center gap-1">
          <span className="text-xs font-bold uppercase text-slate-600">From</span>
          <DatePicker value={from} onChange={(v) => { setFrom(v); updateParams({ rl_from: v }); }} max={to} className="h-7 w-[128px]" data-testid="rolling-ledger-from" />
          <span className="text-xs font-bold uppercase text-slate-600">To</span>
          <DatePicker value={to} onChange={(v) => { setTo(v); updateParams({ rl_to: v }); }} min={from} className="h-7 w-[128px]" data-testid="rolling-ledger-to" />
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setPresetMenuOpen((o) => !o)}
            className="flex h-7 items-center gap-1 rounded-sm border border-slate-300 bg-white px-2 text-xs text-slate-700 hover:bg-slate-50"
            data-testid="rolling-ledger-presets"
          >
            Presets <ChevronDown className="h-3 w-3" />
          </button>
          {presetMenuOpen && (
            <div className="absolute left-0 top-full z-10 mt-1 w-40 rounded-sm border border-slate-200 bg-white p-1 shadow-md">
              {PRESET_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => applyPreset(opt.value)}
                  className={`block w-full rounded-sm px-2 py-1 text-left text-xs hover:bg-slate-50 ${
                    preset === opt.value ? "bg-slate-100 font-medium text-slate-800" : "text-slate-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <MultiSelectDropdown
          label="Type"
          options={TYPE_OPTIONS}
          selected={selectedTypes}
          onChange={(next) => updateParams({ rl_types: next.length > 0 ? next.join(",") : null })}
          className="text-xs"
          data-testid="rolling-ledger-type-filter"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => updateParams({ rl_q: e.target.value || null })}
          placeholder="Search rows…"
          className="h-7 w-48 rounded-sm border border-slate-300 px-2 text-xs"
          data-testid="rolling-ledger-search"
        />
        <button
          type="button"
          onClick={() => updateParams({ rl_rolled: showRolledOver ? "hide" : null })}
          className="flex h-7 items-center gap-1 rounded-sm border border-slate-300 bg-white px-2 text-xs text-slate-700 hover:bg-slate-50"
          data-testid="rolling-ledger-rolled-toggle"
        >
          Rolled over: <b>{showRolledOver ? "show" : "hide"}</b>
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => exportRowsCsv(allRows)}
          disabled={allRows.length === 0}
          className="h-7 rounded-sm border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          data-testid="rolling-ledger-export"
        >
          Export
        </button>
      </div>

      {isLoading && <div className="rounded-sm border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">Loading…</div>}
      {isError && (
        <div className="rounded-sm border border-slate-200 bg-slate-100 p-6 text-center text-xs text-slate-700">
          Failed to load the rolling ledger. Please try again.
        </div>
      )}

      {data && kpis && (
        <>
          {/* KPI strip — ONE row, 8 compact tiles (owner correction 20:5xZ). */}
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8" data-testid="rolling-ledger-kpi-strip">
            {[
              { label: "Opening cash", value: kpis.opening },
              { label: "Income due today", value: kpis.incomeToday, zero: kpis.incomeToday === 0 },
              { label: "Expenses due today", value: kpis.expensesToday, bad: kpis.expensesToday > 0 },
              { label: "Carried over", value: kpis.carriedOver, zero: kpis.carriedOver === 0 },
              { label: "Net today", value: kpis.netToday, sign: true, bad: kpis.netToday < 0 },
              { label: "Projected closing", value: kpis.projectedClosing, sign: true, bad: (kpis.projectedClosing ?? 0) < 0 },
              { label: "Open invoices (not factored)", value: kpis.incomeNotFactored, ok: true },
              { label: "Due next 10 days", value: kpis.dueNext10, ok: true },
            ].map((tile) => (
              <div key={tile.label} className="min-h-[44px] max-h-[48px] overflow-hidden rounded-sm border border-slate-800 bg-white px-2 py-1">
                <div className="truncate text-xs font-bold uppercase tracking-wide text-slate-600" title={tile.label}>
                  {tile.label}
                </div>
                <div
                  className={`mt-0.5 whitespace-nowrap font-mono text-xs font-semibold tabular-nums ${
                    tile.bad ? "text-slate-900" : tile.ok ? "text-slate-700" : tile.zero ? "text-slate-400" : "text-slate-800"
                  }`}
                >
                  {tile.value === null ? "—" : formatCents(tile.value, { sign: tile.sign })}
                </div>
              </div>
            ))}
          </div>

          {/* Split layout: LEFT Expected Income 38% / RIGHT Expected Expenses 62% (owner correction). */}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[38fr_62fr]">
            <div className="overflow-hidden rounded-sm border border-slate-800 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100 px-2.5 py-1.5">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-700">Expected income</span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  {incomeRows.length} rows
                  <GearMenu columns={ALL_INCOME_COLUMNS} labels={INCOME_COLUMN_LABELS} visible={incomeColumns} onToggle={(k) => setIncomeColumns((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; })} />
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-xs" data-testid="rolling-ledger-income-table">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                      {incomeColumns.has("type") && <th className="px-2 py-1.5">{INCOME_COLUMN_LABELS.type}</th>}
                      {incomeColumns.has("counterparty") && <th className="px-2 py-1.5">{INCOME_COLUMN_LABELS.counterparty}</th>}
                      {incomeColumns.has("load") && <th className="px-2 py-1.5">{INCOME_COLUMN_LABELS.load}</th>}
                      {incomeColumns.has("dueCol") && <th className="px-2 py-1.5">{INCOME_COLUMN_LABELS.dueCol}</th>}
                      {incomeColumns.has("in") && <th className="px-2 py-1.5">{INCOME_COLUMN_LABELS.in}</th>}
                      {incomeColumns.has("amount") && <th className="px-2 py-1.5 text-right">{INCOME_COLUMN_LABELS.amount}</th>}
                      {incomeColumns.has("status") && <th className="px-2 py-1.5">{INCOME_COLUMN_LABELS.status}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {incomeRows.length === 0 && (
                      <tr>
                        <td colSpan={incomeColumns.size || 1} className="px-2 py-6 text-center text-slate-400">
                          No expected income in range.
                        </td>
                      </tr>
                    )}
                    {incomeRows.map((row) => {
                      const rowKey = `${row.row_kind}-${row.document_kind}-${row.document_id}-${row.due_date}`;
                      return (
                        <>
                          <tr
                            key={rowKey}
                            onClick={() => setAdjustingRowKey(adjustingRowKey === rowKey ? null : rowKey)}
                            className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                            title="click → adjust expectation"
                          >
                            {incomeColumns.has("type") && <td className="px-2 py-1.5 text-slate-700">{row.type}</td>}
                            {incomeColumns.has("counterparty") && (
                              <td className="px-2 py-1.5">
                                <EntityLink kind={row.document_kind} id={row.document_id} label={row.document_label} onClick={(e) => e.stopPropagation()} />{" "}
                                <span className="text-slate-400">{row.counterparty}</span>
                              </td>
                            )}
                            {incomeColumns.has("load") && (
                              <td className="px-2 py-1.5">
                                {row.load_id ? (
                                  <EntityLink kind="load" id={row.load_id} label={row.load_number ?? row.load_id} onClick={(e) => e.stopPropagation()} />
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                            )}
                            {incomeColumns.has("dueCol") && <td className="px-2 py-1.5 text-slate-500">{fmtDateShort(row.due_date)}</td>}
                            {incomeColumns.has("in") && (
                              <td className="px-2 py-1.5 text-slate-500">{row.days_overdue > 0 ? `+${row.days_overdue}d` : row.days_overdue === 0 ? "today" : `${-row.days_overdue}d`}</td>
                            )}
                            {incomeColumns.has("amount") && (
                              <td className={`px-2 py-1.5 text-right font-mono font-medium ${row.amount_cents === 0 ? "text-slate-400" : "text-slate-800"}`}>
                                {formatCents(row.amount_cents)}
                              </td>
                            )}
                            {incomeColumns.has("status") && (
                              <td className="px-2 py-1.5">
                                <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-xs ${row.is_rollover_echo ? "border-slate-200 bg-slate-100 text-slate-500" : STATUS_CLASS[row.status]}`}>
                                  {row.is_rollover_echo ? "Rolled" : row.type === "Factor advance" || row.type === "Factor reserve" ? "Factored" : STATUS_LABEL[row.status]}
                                </span>
                                {row.reason_label && <div className="mt-0.5 text-xs text-slate-400">rolled — {row.reason_label}</div>}
                              </td>
                            )}
                          </tr>
                          {adjustingRowKey === rowKey && (
                            <tr>
                              <td colSpan={incomeColumns.size || 1} className="p-0">
                                <AdjustPopover
                                  row={row}
                                  reasons={reasons}
                                  applies="income"
                                  onClose={() => setAdjustingRowKey(null)}
                                  pending={adjustMutation.isPending}
                                  onSubmit={({ projectedDate, reasonCode, note, hiddenReason }) =>
                                    adjustMutation.mutate({ row, projectedDate, reasonCode, note, hiddenReason })
                                  }
                                />
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="overflow-hidden rounded-sm border border-slate-800 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100 px-2.5 py-1.5">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-700">
                  Expected expenses{selectedDate ? ` · ${fmtDate(selectedDate)}` : ""}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  {expenseRowsToday.length} rows
                  <GearMenu columns={ALL_EXPENSE_COLUMNS} labels={EXPENSE_COLUMN_LABELS} visible={expenseColumns} onToggle={(k) => setExpenseColumns((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; })} />
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-xs" data-testid="rolling-ledger-expense-table">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                      {expenseColumns.has("type") && <th className="px-2 py-1.5">{EXPENSE_COLUMN_LABELS.type}</th>}
                      {expenseColumns.has("no") && <th className="px-2 py-1.5">{EXPENSE_COLUMN_LABELS.no}</th>}
                      {expenseColumns.has("name") && <th className="px-2 py-1.5">{EXPENSE_COLUMN_LABELS.name}</th>}
                      {expenseColumns.has("period") && <th className="px-2 py-1.5">{EXPENSE_COLUMN_LABELS.period}</th>}
                      {expenseColumns.has("dueCol") && <th className="px-2 py-1.5">{EXPENSE_COLUMN_LABELS.dueCol}</th>}
                      {expenseColumns.has("days") && <th className="px-2 py-1.5">{EXPENSE_COLUMN_LABELS.days}</th>}
                      {expenseColumns.has("amount") && <th className="px-2 py-1.5 text-right">{EXPENSE_COLUMN_LABELS.amount}</th>}
                      {expenseColumns.has("status") && <th className="px-2 py-1.5">{EXPENSE_COLUMN_LABELS.status}</th>}
                      {expenseColumns.has("reason") && <th className="px-2 py-1.5">{EXPENSE_COLUMN_LABELS.reason}</th>}
                      {expenseColumns.has("action") && <th className="px-2 py-1.5">{EXPENSE_COLUMN_LABELS.action}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {expenseRowsToday.length === 0 && (
                      <tr>
                        <td colSpan={expenseColumns.size || 1} className="px-2 py-6 text-center text-slate-400">
                          No expected expenses due or carried.
                        </td>
                      </tr>
                    )}
                    {expenseRowsToday.map((row) => {
                      const rowKey = `${row.row_kind}-${row.document_kind}-${row.document_id}-${row.due_date}`;
                      return (
                        <>
                          <tr key={rowKey} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                            {expenseColumns.has("type") && <td className="px-2 py-1.5 text-slate-700">{row.type}</td>}
                            {expenseColumns.has("no") && (
                              <td className="px-2 py-1.5">
                                <EntityLink kind={row.document_kind} id={row.document_id} label={row.document_label} />
                              </td>
                            )}
                            {expenseColumns.has("name") && <td className="px-2 py-1.5 text-slate-700">{row.counterparty}</td>}
                            {expenseColumns.has("period") && <td className="px-2 py-1.5 text-slate-500">{fmtDateShort(row.origin_date)} → {fmtDateShort(row.due_date)}</td>}
                            {expenseColumns.has("dueCol") && <td className="px-2 py-1.5 text-slate-500">{fmtDateShort(row.due_date)}</td>}
                            {expenseColumns.has("days") && <td className="px-2 py-1.5 text-slate-500">{row.days_overdue > 0 ? row.days_overdue : row.days_overdue === 0 ? "today" : "—"}</td>}
                            {expenseColumns.has("amount") && (
                              <td className={`px-2 py-1.5 text-right font-mono font-medium ${row.amount_cents === 0 ? "text-slate-400" : "text-slate-800"}`}>
                                {formatCents(row.amount_cents)}
                              </td>
                            )}
                            {expenseColumns.has("status") && (
                              <td className="px-2 py-1.5">
                                <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-xs ${row.is_rollover_echo ? "border-slate-200 bg-slate-100 text-slate-500" : STATUS_CLASS[row.status]}`}>
                                  {row.is_rollover_echo ? "Rolled" : STATUS_LABEL[row.status]}
                                </span>
                              </td>
                            )}
                            {expenseColumns.has("reason") && <td className="px-2 py-1.5 text-slate-500">{row.reason_label ? `${row.reason_label}${row.reason_note ? " — " + row.reason_note : ""}` : "—"}</td>}
                            {expenseColumns.has("action") && (
                              <td className="px-2 py-1.5">
                                <button
                                  type="button"
                                  onClick={() => setAdjustingRowKey(adjustingRowKey === rowKey ? null : rowKey)}
                                  className="rounded-sm border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  Roll over ▾
                                </button>
                              </td>
                            )}
                          </tr>
                          {adjustingRowKey === rowKey && (
                            <tr>
                              <td colSpan={expenseColumns.size || 1} className="p-0">
                                <AdjustPopover
                                  row={row}
                                  reasons={reasons}
                                  applies="expense"
                                  onClose={() => setAdjustingRowKey(null)}
                                  pending={adjustMutation.isPending}
                                  onSubmit={({ projectedDate, reasonCode, note, hiddenReason }) =>
                                    adjustMutation.mutate({ row, projectedDate, reasonCode, note, hiddenReason })
                                  }
                                />
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Day grid */}
          <div className="overflow-x-auto rounded-sm border border-slate-800 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100 px-2.5 py-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-700">
                Day grid · {fmtDateShort(from)} → {fmtDateShort(to)}
              </span>
              <span className="text-xs text-slate-500">click a date → its rows above · carried = still-open older items</span>
            </div>
            <table className="w-full min-w-[720px] text-xs" data-testid="rolling-ledger-day-grid">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                  <th className="px-2 py-1.5">Date</th>
                  <th className="px-2 py-1.5 text-right">Income due</th>
                  <th className="px-2 py-1.5 text-right">Expenses due</th>
                  <th className="px-2 py-1.5 text-right">Income carried</th>
                  <th className="px-2 py-1.5 text-right">Expenses carried</th>
                  <th className="px-2 py-1.5 text-right">Net</th>
                  <th className="px-2 py-1.5 text-right">Running cash</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((day) => (
                  <tr
                    key={day.date}
                    onClick={() => setSelectedDate(day.date === selectedDate ? null : day.date)}
                    className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 ${
                      day.date === today ? "bg-slate-50 font-medium" : ""
                    } ${day.date === selectedDate ? "bg-slate-100" : ""} ${day.date < today ? "text-slate-400" : ""}`}
                    data-testid={`rolling-ledger-day-${day.date}`}
                  >
                    <td className="px-2 py-1.5">
                      {fmtDate(day.date)}
                      {day.date === today && <span className="ml-1 text-xs text-slate-400">(today)</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right">{day.income_due_cents === 0 ? "—" : formatCents(day.income_due_cents)}</td>
                    <td className="px-2 py-1.5 text-right">{day.expenses_due_cents === 0 ? "—" : formatCents(day.expenses_due_cents)}</td>
                    <td className="px-2 py-1.5 text-right text-slate-400">{day.income_carry_over_cents === 0 ? "—" : formatCents(day.income_carry_over_cents)}</td>
                    <td className="px-2 py-1.5 text-right text-slate-400">{day.expenses_carry_over_cents === 0 ? "—" : formatCents(day.expenses_carry_over_cents)}</td>
                    <td className={`px-2 py-1.5 text-right ${day.net_cents < 0 ? "text-slate-800" : "text-slate-600"}`}>
                      {day.net_cents === 0 ? "—" : formatCents(day.net_cents, { sign: true })}
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium text-slate-800">
                      {day.running_cash_cents === null ? "—" : formatCents(day.running_cash_cents, { sign: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
