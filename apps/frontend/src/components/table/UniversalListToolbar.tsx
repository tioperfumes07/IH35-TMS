import { useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { DatePicker } from "../forms/DatePicker";
import { MoneyInput } from "../forms/MoneyInput";
import { companyToday, monthBoundsIso } from "../../lib/businessDate";
import { TableSearch } from "./TableSearch";

/** QBO-style date range presets — same set as Account Register (This Month / Last Month / …). */
export function applyUniversalDatePreset(preset: string): { from: string; to: string } | null {
  const today = companyToday();
  const [y, m] = today.split("-").map(Number);
  switch (preset) {
    case "this_month": {
      const b = monthBoundsIso(today);
      return { from: b.start, to: b.end };
    }
    case "last_month": {
      const ly = m === 1 ? y - 1 : y;
      const lm = m === 1 ? 12 : m - 1;
      const b = monthBoundsIso(`${ly}-${String(lm).padStart(2, "0")}-01`);
      return { from: b.start, to: b.end };
    }
    case "this_quarter": {
      const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
      const qEndMonth = qStartMonth + 2;
      const from = `${y}-${String(qStartMonth).padStart(2, "0")}-01`;
      const end = monthBoundsIso(`${y}-${String(qEndMonth).padStart(2, "0")}-01`).end;
      return { from, to: end };
    }
    case "this_year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "ytd":
      return { from: `${y}-01-01`, to: today };
    default:
      return null;
  }
}

const QBO_DATE_PRESETS: Array<{ value: string; label: string }> = [
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "this_year", label: "This Year" },
  { value: "ytd", label: "Year to date" },
  { value: "custom", label: "Custom" },
];

export type UniversalToolbarColumn = {
  key: string;
  label: string;
};

export type UniversalRange = {
  key: string;
  kind: "date" | "amount" | "number";
  from: string;
  to: string;
};

// LV-LEGAL-MATTERS-RANGE-OMITS-SOL-DATE: include statute/SOL/hearing + *_at timestamps.
// Postgres-style *_at keys (statute_of_limitations_at) and Legal "SOL / hearing" labels must
// register as date range fields — otherwise Range mounts with zero eligible columns / Apply disabled.
const DATE_FIELD =
  /(^|[_\s])(date|time|created|updated|due|pickup|delivery|effective|expires|period|as of|at|statute|limitation|limitations|sol|hearing|deadline|filing)([_\s]|$)/i;
const AMOUNT_FIELD = /(^|[_\s])(amount|total|cost|price|balance|revenue|pay|charge|fee|rate|cents|dollars)([_\s]|$)/i;
const NUMBER_FIELD = /(^|[_\s])(year|odometer|mileage|miles|hours|count|quantity|qty|days)([_\s]|$)/i;

export function inferUniversalRangeColumns(columns: UniversalToolbarColumn[]): Array<UniversalToolbarColumn & { kind: UniversalRange["kind"] }> {
  const rangeColumns: Array<UniversalToolbarColumn & { kind: UniversalRange["kind"] }> = [];
  for (const column of columns) {
    const haystack = `${column.key.replaceAll("-", "_")} ${column.label}`;
    if (DATE_FIELD.test(haystack)) rangeColumns.push({ ...column, kind: "date" });
    else if (AMOUNT_FIELD.test(haystack)) rangeColumns.push({ ...column, kind: "amount" });
    else if (NUMBER_FIELD.test(haystack)) rangeColumns.push({ ...column, kind: "number" });
  }
  return rangeColumns;
}

function searchable(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    try { return JSON.stringify(value); } catch { return ""; }
  }
  return String(value);
}

function numericValue(value: unknown, key: string): number | null {
  if (typeof value === "number") return /_cents$/i.test(key) ? value / 100 : value;
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function applyUniversalListFilters<T>(
  rows: T[],
  search: string,
  range: UniversalRange | null,
): T[] {
  const needle = search.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    const record = row as Record<string, unknown>;
    if (needle && !Object.values(record).some((value) => searchable(value).toLocaleLowerCase().includes(needle))) return false;
    if (!range?.key || (!range.from && !range.to)) return true;
    const value = record[range.key];
    if (range.kind === "date") {
      const date = searchable(value).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
      return (!range.from || date >= range.from) && (!range.to || date <= range.to);
    }
    const amount = numericValue(value, range.key);
    if (amount == null) return false;
    const from = range.from === "" ? null : Number(range.from);
    const to = range.to === "" ? null : Number(range.to);
    return (from == null || amount >= from) && (to == null || amount <= to);
  });
}

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  columns: UniversalToolbarColumn[];
  range: UniversalRange | null;
  onRangeApply: (range: UniversalRange | null) => void;
  resultCount: number;
  totalCount: number;
  searchPlaceholder?: string;
  /** When true, hide TableSearch (page owns server-side search elsewhere). */
  hideSearch?: boolean;
  className?: string;
};

export function UniversalListToolbar({
  search,
  onSearchChange,
  columns,
  range,
  onRangeApply,
  resultCount,
  totalCount,
  searchPlaceholder = "Search rows…",
  hideSearch = false,
  className = "",
}: Props) {
  const rangeColumns = useMemo(() => inferUniversalRangeColumns(columns), [columns]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<UniversalRange | null>(range);
  const ref = useRef<HTMLDivElement>(null);

  const cancel = () => { setDraft(range); setOpen(false); };
  const reset = () => setDraft(null);
  const apply = () => { onRangeApply(draft?.key ? draft : null); setOpen(false); };

  useEffect(() => {
    if (open) setDraft(range);
  }, [open, range]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) cancel(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, range]);

  const selected = rangeColumns.find((column) => column.key === draft?.key);
  return (
    <div className={`flex min-w-0 flex-1 flex-wrap items-center gap-2 ${className}`.trim()} data-list-toolbar="search-range-gear">
      {hideSearch ? null : (
        <TableSearch value={search} onChange={onSearchChange} placeholder={searchPlaceholder} className="min-w-[12rem] max-w-xl flex-1" />
      )}
      <div className="relative" ref={ref}>
        <button
          type="button"
          aria-expanded={open}
          aria-label="Date or amount range"
          className="flex h-8 items-center gap-1 rounded-sm border border-gray-300 bg-white px-2 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
          onClick={() => setOpen((current) => !current)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          Range
          {range?.key ? <span className="rounded-full bg-[#1F2A44] px-1 text-[10px] text-white">1</span> : null}
        </button>
        {open ? (
          <div className="absolute left-0 z-30 mt-1 w-[min(520px,90vw)] space-y-3 rounded-sm border border-gray-200 bg-white p-3 shadow-lg">
            <label className="block text-[11px] font-semibold text-gray-600">
              Date or amount field
              <select
                aria-label="Range field"
                className="mt-1 h-8 w-full rounded-sm border border-gray-300 bg-white px-2 text-[12px]"
                value={draft?.key ?? ""}
                onChange={(event) => {
                  const next = rangeColumns.find((column) => column.key === event.target.value);
                  setDraft(next ? { key: next.key, kind: next.kind, from: "", to: "" } : null);
                }}
              >
                <option value="">Choose field…</option>
                {rangeColumns.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}
              </select>
            </label>
            {selected ? (
              <div className="space-y-2">
                {selected.kind === "date" ? (
                  <label className="block text-[11px] font-semibold text-gray-600">
                    Date range (QBO)
                    <select
                      aria-label="QBO date range preset"
                      className="mt-1 h-8 w-full rounded-sm border border-gray-300 bg-white px-2 text-[12px]"
                      defaultValue="custom"
                      onChange={(event) => {
                        const preset = event.target.value;
                        if (preset === "custom") return;
                        const bounds = applyUniversalDatePreset(preset);
                        if (!bounds || !draft?.key) return;
                        setDraft({ key: draft.key, kind: "date", from: bounds.from, to: bounds.to });
                      }}
                    >
                      {QBO_DATE_PRESETS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="text-[11px] font-semibold text-gray-600">From
                    {selected.kind === "date" ? (
                      <DatePicker value={draft?.from ?? ""} onChange={(value) => setDraft((current) => current ? { ...current, from: value } : current)} className="mt-1 w-full" />
                    ) : selected.kind === "amount" ? (
                      <MoneyInput valueDollars={draft?.from ? Number(draft.from) : null} onChangeDollars={(value) => setDraft((current) => current ? { ...current, from: value == null ? "" : String(value) } : current)} className="mt-1" ariaLabel="Range from amount" />
                    ) : (
                      <input type="number" aria-label="Range from number" value={draft?.from ?? ""} onChange={(event) => setDraft((current) => current ? { ...current, from: event.target.value } : current)} className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-[12px]" />
                    )}
                  </label>
                  <label className="text-[11px] font-semibold text-gray-600">To
                    {selected.kind === "date" ? (
                      <DatePicker value={draft?.to ?? ""} onChange={(value) => setDraft((current) => current ? { ...current, to: value } : current)} className="mt-1 w-full" />
                    ) : selected.kind === "amount" ? (
                      <MoneyInput valueDollars={draft?.to ? Number(draft.to) : null} onChangeDollars={(value) => setDraft((current) => current ? { ...current, to: value == null ? "" : String(value) } : current)} className="mt-1" ariaLabel="Range to amount" />
                    ) : (
                      <input type="number" aria-label="Range to number" value={draft?.to ?? ""} onChange={(event) => setDraft((current) => current ? { ...current, to: event.target.value } : current)} className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-[12px]" />
                    )}
                  </label>
                </div>
              </div>
            ) : rangeColumns.length === 0 ? (
              // Honest empty: only when inference found zero rangeable columns.
              <p className="text-[12px] text-gray-500">This list has no date or amount column to range-filter.</p>
            ) : (
              // LV-RANGE-PANEL-FALSE-EMPTY-BEFORE-FIELD: do NOT claim "no column" when
              // SOL/hearing (or any inferred field) is already in the select — user just
              // has not chosen a field yet (Apply stays disabled until draft.key).
              <p className="text-[12px] text-gray-500">Choose a field above to set From/To.</p>
            )}
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-3">
              <button type="button" className="rounded-sm px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100" onClick={reset}>Reset</button>
              <button type="button" className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50" onClick={cancel}>Cancel</button>
              <button type="button" className="rounded-sm bg-[#1F2A44] px-2 py-1 text-xs font-semibold text-white hover:bg-[#172036] disabled:opacity-50" disabled={!draft?.key} onClick={apply}>Apply</button>
            </div>
          </div>
        ) : null}
      </div>
      <span className="text-[11px] text-gray-500">{resultCount === totalCount ? `${totalCount}` : `${resultCount} of ${totalCount}`} rows</span>
    </div>
  );
}
