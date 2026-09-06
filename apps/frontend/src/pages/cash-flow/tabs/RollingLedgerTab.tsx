import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Settings } from "lucide-react";
import { getRollingLedger, type RollingLedgerResult, type RollingLedgerRow } from "../../../api/cashFlow";
import { addDaysIso, companyToday } from "../../../lib/businessDate";
import { formatUsdCents } from "../../../lib/money";
import { EntityLink } from "../../../components/shared/EntityLink";
import { DatePicker } from "../../../components/forms/DatePicker";
import { MultiSelectDropdown } from "../../../components/forms/MultiSelectDropdown";

// CASH-FLOW-02 (owner order 2026-09-06 20:1xZ). Part (a): read model + rows with real dates +
// carry-forward + the day grid. Part (b) (this file, current pass): date-range presets, a type
// multi-select filter, search, a gear for row-table columns, CSV export, and URL persistence —
// same ParityTable-toolbar shape the owner asked for (Banking B4 rule: ONE bar, not several).
// Overdue-3-days notifications ship server-side in cron/cash-flow-rolling-ledger-notify.cron.ts.

type DatePreset = "7d" | "14d" | "30d" | "this_month" | "next_month" | "custom";

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

type ColumnKey = "type" | "document" | "counterparty" | "origin_date" | "due_date" | "amount" | "days_overdue" | "status";

const COLUMN_LABELS: Record<ColumnKey, string> = {
  type: "Type",
  document: "Document",
  counterparty: "Counterparty",
  origin_date: "Origin date",
  due_date: "Due date",
  amount: "Amount",
  days_overdue: "Days overdue",
  status: "Status",
};

const ALL_COLUMNS = Object.keys(COLUMN_LABELS) as ColumnKey[];

function formatCents(cents: number, opts?: { sign?: boolean }): string {
  const abs = Math.abs(cents);
  const dollars = formatUsdCents(abs);
  if (opts?.sign && cents < 0) return `−${dollars}`;
  if (opts?.sign && cents > 0) return `+${dollars}`;
  return cents < 0 ? `−${dollars}` : dollars;
}

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

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
  if (preset === "next_month") {
    const start = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    const end = new Date(base.getFullYear(), base.getMonth() + 2, 0);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }
  return { from: today, to: addDaysIso(today, 13) };
}

const PRESET_OPTIONS: { value: DatePreset; label: string }[] = [
  { value: "7d", label: "Next 7 days" },
  { value: "14d", label: "Next 14 days" },
  { value: "30d", label: "Next 30 days" },
  { value: "this_month", label: "This month" },
  { value: "next_month", label: "Next month" },
  { value: "custom", label: "Custom" },
];

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function exportRowsCsv(rows: RollingLedgerRow[]): void {
  const header = ["Type", "Document", "Counterparty", "Origin date", "Due date", "Amount", "Days overdue", "Status"];
  const body = rows.map((r) =>
    [
      r.type,
      r.document_label,
      r.counterparty,
      r.origin_date,
      r.due_date,
      (r.amount_cents / 100).toFixed(2),
      String(r.days_overdue),
      r.status,
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

function DatesDropdown({
  preset,
  from,
  to,
  onPreset,
  onCustomFrom,
  onCustomTo,
}: {
  preset: DatePreset;
  from: string;
  to: string;
  onPreset: (p: DatePreset) => void;
  onCustomFrom: (v: string) => void;
  onCustomTo: (v: string) => void;
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

  const label = PRESET_OPTIONS.find((p) => p.value === preset)?.label ?? "Custom";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        data-testid="rolling-ledger-dates-dropdown"
      >
        Dates: {label} <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-64 rounded-sm border border-slate-200 bg-white p-2 shadow-md">
          {PRESET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onPreset(opt.value);
                if (opt.value !== "custom") setOpen(false);
              }}
              className={`block w-full rounded-sm px-2 py-1.5 text-left text-xs hover:bg-slate-50 ${
                preset === opt.value ? "bg-slate-100 font-medium text-slate-800" : "text-slate-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
          {preset === "custom" && (
            <div className="mt-2 flex gap-2 border-t border-slate-100 pt-2">
              <label className="flex flex-1 flex-col gap-1 text-xs">
                <span className="text-slate-500">From</span>
                <DatePicker value={from} onChange={onCustomFrom} max={to} data-testid="rolling-ledger-from" aria-label="From date" />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-xs">
                <span className="text-slate-500">To</span>
                <DatePicker value={to} onChange={onCustomTo} min={from} data-testid="rolling-ledger-to" aria-label="To date" />
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ColumnsGear({ visible, onToggle }: { visible: Set<ColumnKey>; onToggle: (key: ColumnKey) => void }) {
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
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        aria-label="Columns"
        data-testid="rolling-ledger-columns-gear"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-52 rounded-sm border border-slate-200 bg-white p-2 shadow-md">
          {ALL_COLUMNS.map((key) => (
            <label key={key} className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
              <input type="checkbox" checked={visible.has(key)} onChange={() => onToggle(key)} className="h-3.5 w-3.5" />
              {COLUMN_LABELS[key]}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<RollingLedgerRow["status"], string> = {
  overdue: "Overdue",
  due_today: "Due today",
  upcoming: "Upcoming",
};

// §7 palette law — financial UI never uses amber/warning colors, even for an overdue signal.
const STATUS_CLASS: Record<RollingLedgerRow["status"], string> = {
  overdue: "border-slate-300 bg-slate-200 text-slate-800 font-semibold",
  due_today: "border-slate-200 bg-slate-100 text-slate-700",
  upcoming: "border-slate-200 bg-white text-slate-500",
};

type Props = {
  operatingCompanyId: string;
};

export function RollingLedgerTab({ operatingCompanyId }: Props) {
  const today = companyToday();
  const [searchParams, setSearchParams] = useSearchParams();

  const preset = (searchParams.get("rl_preset") as DatePreset) || "14d";
  const customFrom = searchParams.get("rl_from") || today;
  const customTo = searchParams.get("rl_to") || addDaysIso(today, 13);
  const { from, to } = preset === "custom" ? { from: customFrom, to: customTo } : presetRange(preset, today);

  const selectedTypes = useMemo(() => {
    const raw = searchParams.get("rl_types");
    return raw ? raw.split(",").filter(Boolean) : [];
  }, [searchParams]);
  const search = searchParams.get("rl_q") || "";
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(new Set(ALL_COLUMNS));

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

  const filteredRows = useMemo(() => {
    if (!data) return [];
    let rows = data.rows;
    if (selectedDate) rows = rows.filter((r) => r.due_date === selectedDate);
    if (selectedTypes.length > 0) rows = rows.filter((r) => selectedTypes.includes(r.type));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => r.counterparty.toLowerCase().includes(q) || r.document_label.toLowerCase().includes(q));
    }
    return rows;
  }, [data, selectedDate, selectedTypes, search]);

  const sortedRows = useMemo(
    () => [...filteredRows].sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0)),
    [filteredRows]
  );

  const toggleColumn = (key: ColumnKey) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-4" data-testid="cash-flow-rolling-ledger-tab">
      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-slate-200 bg-white p-3">
        <DatesDropdown
          preset={preset}
          from={customFrom}
          to={customTo}
          onPreset={(p) => updateParams({ rl_preset: p === "14d" ? null : p })}
          onCustomFrom={(v) => updateParams({ rl_from: v })}
          onCustomTo={(v) => updateParams({ rl_to: v })}
        />
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
          placeholder="Search counterparty or document…"
          className="w-56 rounded-sm border border-slate-300 px-2 py-1.5 text-xs"
          data-testid="rolling-ledger-search"
        />
        <ColumnsGear visible={visibleColumns} onToggle={toggleColumn} />
        <button
          type="button"
          onClick={() => exportRowsCsv(sortedRows)}
          disabled={sortedRows.length === 0}
          className="rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          data-testid="rolling-ledger-export"
        >
          Export CSV
        </button>
        {selectedDate && (
          <button
            type="button"
            onClick={() => setSelectedDate(null)}
            className="rounded-sm border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
            data-testid="rolling-ledger-clear-date"
          >
            Showing {fmtDate(selectedDate)} only — clear
          </button>
        )}
        {data?.opening_cash_cents !== null && data?.opening_cash_cents !== undefined && (
          <span className="ml-auto text-xs text-slate-500">
            Opening cash: <span className="font-semibold text-slate-800">{formatCents(data.opening_cash_cents)}</span>
          </span>
        )}
      </div>

      {isLoading && <div className="rounded-sm border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">Loading…</div>}
      {isError && (
        <div className="rounded-sm border border-slate-200 bg-slate-100 p-6 text-center text-xs text-slate-700">
          Failed to load the rolling ledger. Please try again.
        </div>
      )}

      {data && (
        <>
          <div className="overflow-x-auto rounded-sm border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] text-xs" data-testid="rolling-ledger-day-grid">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 text-right font-medium">Income due</th>
                  <th className="px-3 py-2 text-right font-medium">Expenses due</th>
                  <th className="px-3 py-2 text-right font-medium">Carry-over (income)</th>
                  <th className="px-3 py-2 text-right font-medium">Carry-over (expenses)</th>
                  <th className="px-3 py-2 text-right font-medium">Net</th>
                  <th className="px-3 py-2 text-right font-medium">Running cash</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((day) => (
                  <tr
                    key={day.date}
                    onClick={() => setSelectedDate(day.date === selectedDate ? null : day.date)}
                    className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 ${
                      day.date === today ? "bg-slate-50 font-medium" : ""
                    } ${day.date === selectedDate ? "bg-slate-100" : ""}`}
                    data-testid={`rolling-ledger-day-${day.date}`}
                  >
                    <td className="px-3 py-2 text-slate-700">
                      {fmtDate(day.date)}
                      {day.date === today && <span className="ml-1 text-xs text-slate-400">(today)</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatCents(day.income_due_cents)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatCents(day.expenses_due_cents)}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{formatCents(day.income_carry_over_cents)}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{formatCents(day.expenses_carry_over_cents)}</td>
                    <td className={`px-3 py-2 text-right ${day.net_cents < 0 ? "text-slate-800" : "text-slate-600"}`}>
                      {formatCents(day.net_cents, { sign: true })}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-slate-800">
                      {day.running_cash_cents === null ? "—" : formatCents(day.running_cash_cents, { sign: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-sm border border-slate-200 bg-white">
            <table className="w-full min-w-[900px] text-xs" data-testid="rolling-ledger-rows-table">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                  {visibleColumns.has("type") && <th className="px-3 py-2 font-medium">Type</th>}
                  {visibleColumns.has("document") && <th className="px-3 py-2 font-medium">Document</th>}
                  {visibleColumns.has("counterparty") && <th className="px-3 py-2 font-medium">Counterparty</th>}
                  {visibleColumns.has("origin_date") && <th className="px-3 py-2 font-medium">Origin date</th>}
                  {visibleColumns.has("due_date") && <th className="px-3 py-2 font-medium">Due date</th>}
                  {visibleColumns.has("amount") && <th className="px-3 py-2 text-right font-medium">Amount</th>}
                  {visibleColumns.has("days_overdue") && <th className="px-3 py-2 text-right font-medium">Days overdue</th>}
                  {visibleColumns.has("status") && <th className="px-3 py-2 font-medium">Status</th>}
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 && (
                  <tr>
                    <td colSpan={visibleColumns.size || 1} className="px-3 py-6 text-center text-slate-400">
                      {selectedDate || selectedTypes.length > 0 || search
                        ? "No open obligations match the current filters."
                        : "No open obligations."}
                    </td>
                  </tr>
                )}
                {sortedRows.map((row) => (
                  <tr
                    key={`${row.row_kind}-${row.document_kind}-${row.document_id}`}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    {visibleColumns.has("type") && (
                      <td className="px-3 py-2 text-slate-700">
                        <span className={row.row_kind === "income" ? "text-slate-700" : "text-slate-600"}>{row.type}</span>
                      </td>
                    )}
                    {visibleColumns.has("document") && (
                      <td className="px-3 py-2">
                        <EntityLink kind={row.document_kind} id={row.document_id} label={row.document_label} />
                      </td>
                    )}
                    {visibleColumns.has("counterparty") && <td className="px-3 py-2 text-slate-700">{row.counterparty}</td>}
                    {visibleColumns.has("origin_date") && <td className="px-3 py-2 text-slate-500">{fmtDate(row.origin_date)}</td>}
                    {visibleColumns.has("due_date") && <td className="px-3 py-2 text-slate-500">{fmtDate(row.due_date)}</td>}
                    {visibleColumns.has("amount") && (
                      <td className="px-3 py-2 text-right font-medium text-slate-800">{formatCents(row.amount_cents)}</td>
                    )}
                    {visibleColumns.has("days_overdue") && (
                      <td className="px-3 py-2 text-right text-slate-500">{row.days_overdue > 0 ? row.days_overdue : "—"}</td>
                    )}
                    {visibleColumns.has("status") && (
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASS[row.status]}`}>
                          {STATUS_LABEL[row.status]}
                        </span>
                      </td>
                    )}
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
