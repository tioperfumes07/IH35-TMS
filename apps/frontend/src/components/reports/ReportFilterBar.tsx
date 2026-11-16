import { useCallback, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { DatePicker } from "../forms/DatePicker";
import { companyToday, monthBoundsIso, addDaysIso } from "../../lib/businessDate";
import { SelectCombobox } from "../Combobox";

// RPT-06 — Inline filter bar visible on first load (0 clicks).
// Replaces the CollapsedListFilters popover pattern on report landing pages.
// The bar is always inline: date range + presets + search + optional second/status slots.
// Locked scale: text-xs (12px), slate/gray tokens only, 28px height controls, rounded-sm (2px).

export type ReportPreset = "this_week" | "this_month" | "last_month" | "ytd";

type ReportFilterBarProps = {
  testIdPrefix: string;
  fromDate: string | null;
  toDate: string | null;
  onFromDateChange: (date: string | null) => void;
  onToDateChange: (date: string | null) => void;
  onPresetSelect: (preset: ReportPreset) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  children?: ReactNode;
  statusFilter?: string;
  onStatusFilterChange?: (value: string) => void;
  statusOptions?: Array<{ value: string; label: string }>;
  /** When provided, an Apply button renders and calls this on click. Used with useStagedListFilters. */
  onApply?: () => void;
  applyDisabled?: boolean;
  /** When provided with onApply, a Cancel button renders and calls this on click. */
  onCancel?: () => void;
  /** When provided with onApply, a Reset button renders and calls this on click. */
  onReset?: () => void;
  /**
   * V3 board bar (docs/design/v3/Reports-*.dc.html, Dispatch-LoadHistory): one white bar, 6px corners, padding 8/10,
   * gap 8; "From"/"To" as 11px muted labels; period presets in a segmented group; 28px / 6px / 600 12px controls;
   * navy Apply. No dividers. Same controls, same behavior — only the drawing changes.
   */
  board?: boolean;
  /**
   * Board bar only: more period buttons drawn INSIDE the preset segmented group, after YTD (Dispatch-LoadHistory.dc.html
   * draws "This week · This month · Last month · YTD · All" as one group). `active` paints the navy selected segment.
   */
  extraPresets?: Array<{ id: string; label: string; active: boolean; onSelect: () => void }>;
};

const B_FONT = "Inter, ui-sans-serif, system-ui, sans-serif";
const B_BAR = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #DDE1E7", borderRadius: 6, padding: "8px 10px", fontFamily: B_FONT, lineHeight: "normal" } as const;
const B_LABEL = { fontSize: 11, color: "#5B6576" } as const;
const B_SEG = { display: "inline-flex", background: "#fff", border: "1px solid #DDE1E7", borderRadius: 6, padding: 2, gap: 2 } as const;
const B_SEG_BTN = { padding: "4px 10px", borderRadius: 4, fontFamily: B_FONT, fontSize: 11, fontWeight: 600, border: 0, background: "transparent", color: "#5B6576", lineHeight: "normal", cursor: "pointer" } as const;
const B_BTN = { height: 28, boxSizing: "border-box", padding: "0 12px", display: "inline-flex", alignItems: "center", borderRadius: 6, fontFamily: B_FONT, fontSize: 12, fontWeight: 600, background: "#fff", color: "#111827", border: "1px solid #DDE1E7", lineHeight: "normal", cursor: "pointer" } as const;
const B_APPLY = { ...B_BTN, background: "#13233F", color: "#fff", border: 0 } as const;
const B_SEG_BTN_ON = { ...B_SEG_BTN, background: "#13233F", color: "#fff" } as const;

const PRESET_BUTTONS: Array<{ preset: ReportPreset; label: string }> = [
  { preset: "this_week", label: "This week" },
  { preset: "this_month", label: "This month" },
  { preset: "last_month", label: "Last month" },
  { preset: "ytd", label: "YTD" },
];

function startOfWeekMonday(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const diff = dow === 0 ? 6 : dow - 1;
  return addDaysIso(today, -diff);
}

function startOfYear(today: string): string {
  const [y] = today.split("-").map(Number);
  return `${y}-01-01`;
}

function lastMonthBounds(today: string): { start: string; end: string } {
  const [y, m] = today.split("-").map(Number);
  const prevMonth = m - 1;
  const prevYear = prevMonth === 0 ? y - 1 : y;
  const prevM = prevMonth === 0 ? 12 : prevMonth;
  const prevIso = `${prevYear}-${String(prevM).padStart(2, "0")}-01`;
  return monthBoundsIso(prevIso);
}

export function computePresetRange(preset: ReportPreset, today: string = companyToday()): { from: string; to: string } {
  switch (preset) {
    case "this_week":
      return { from: startOfWeekMonday(today), to: today };
    case "this_month":
      return { from: monthBoundsIso(today).start, to: today };
    case "last_month": {
      const { start, end } = lastMonthBounds(today);
      return { from: start, to: end };
    }
    case "ytd":
      return { from: startOfYear(today), to: today };
  }
}

export function ReportFilterBar({
  testIdPrefix,
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  onPresetSelect,
  search,
  onSearchChange,
  children,
  statusFilter,
  onStatusFilterChange,
  statusOptions,
  onApply,
  applyDisabled,
  onCancel,
  onReset,
  board = false,
  extraPresets,
}: ReportFilterBarProps) {
  const [, setSearchParams] = useSearchParams();

  const syncUrl = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  /** One setSearchParams call — three sequential syncUrl races dropped from_date under remount. */
  const syncUrlMany = useCallback(
    (entries: Array<[string, string | null]>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of entries) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleFromDateChange = useCallback(
    (next: string) => {
      onFromDateChange(next || null);
      syncUrl("from_date", next || null);
    },
    [onFromDateChange, syncUrl],
  );

  const handleToDateChange = useCallback(
    (next: string) => {
      onToDateChange(next || null);
      syncUrl("to_date", next || null);
    },
    [onToDateChange, syncUrl],
  );

  const handlePreset = useCallback(
    (preset: ReportPreset) => {
      const { from, to } = computePresetRange(preset);
      // Staged draft first (Apply stays explicit), then one atomic URL write for both dates + preset.
      onFromDateChange(from);
      onToDateChange(to);
      onPresetSelect(preset);
      syncUrlMany([
        ["from_date", from],
        ["to_date", to],
        ["preset", preset],
      ]);
    },
    [onFromDateChange, onToDateChange, onPresetSelect, syncUrlMany],
  );

  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      onSearchChange?.(value);
      syncUrl("q", value || null);
    },
    [onSearchChange, syncUrl],
  );

  const handleStatus = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      onStatusFilterChange?.(value);
      syncUrl("status", value || null);
    },
    [onStatusFilterChange, syncUrl],
  );

  if (board) {
    return (
      <div data-report-filter-bar="inline" data-testid={`${testIdPrefix}-report-filter-bar`} style={B_BAR}>
        <span style={B_LABEL}>From</span>
        <DatePicker board className="w-[124px]" value={fromDate ?? ""} onChange={handleFromDateChange} aria-label="From date" data-testid={`${testIdPrefix}-filter-from`} />
        <span style={B_LABEL}>To</span>
        <DatePicker board className="w-[124px]" value={toDate ?? ""} onChange={handleToDateChange} aria-label="To date" data-testid={`${testIdPrefix}-filter-to`} />
        <span style={B_SEG}>
          {PRESET_BUTTONS.map((btn) => {
            // The selected period is the one whose range the bar holds right now (no separate state to drift).
            const r = computePresetRange(btn.preset);
            const on = fromDate === r.from && toDate === r.to;
            return (
              <button key={btn.preset} type="button" aria-pressed={on} onClick={() => handlePreset(btn.preset)} style={on ? B_SEG_BTN_ON : B_SEG_BTN} data-testid={`${testIdPrefix}-preset-${btn.preset}`}>
                {btn.label}
              </button>
            );
          })}
          {(extraPresets ?? []).map((p) => (
            <button key={p.id} type="button" aria-pressed={p.active} onClick={p.onSelect} style={p.active ? B_SEG_BTN_ON : B_SEG_BTN} data-testid={`${testIdPrefix}-preset-${p.id}`}>
              {p.label}
            </button>
          ))}
        </span>
        {children}
        {onSearchChange ? (
          <input type="text" value={search ?? ""} onChange={handleSearch} placeholder="Search…" aria-label="Search"
            style={{ ...B_BTN, width: 160, cursor: "text", fontWeight: 400 }} data-testid={`${testIdPrefix}-filter-search`} />
        ) : null}
        {statusOptions && statusOptions.length > 0 ? (
          <SelectCombobox value={statusFilter ?? ""} onChange={handleStatus} aria-label="Status" className="h-7 rounded-sm border border-[#E5E7EB] bg-white px-2 text-xs text-[#1F2A44]" data-testid={`${testIdPrefix}-filter-status`}>
            <option value="">All</option>
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </SelectCombobox>
        ) : null}
        {onApply ? (
          <>
            {onReset ? <button type="button" onClick={onReset} style={B_BTN} data-testid={`${testIdPrefix}-reset`}>Reset</button> : null}
            {onCancel ? <button type="button" onClick={onCancel} style={B_BTN} data-testid={`${testIdPrefix}-cancel`}>Cancel</button> : null}
            <button type="button" onClick={onApply} disabled={applyDisabled} style={{ ...B_APPLY, opacity: applyDisabled ? 0.5 : 1 }} data-testid={`${testIdPrefix}-apply`}>Apply</button>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div
      data-report-filter-bar="inline"
      data-testid={`${testIdPrefix}-report-filter-bar`}
      className="flex flex-wrap items-center gap-2 rounded-sm border border-[#E5E7EB] bg-white px-3 py-2 text-xs text-[#1F2A44]"
    >
      <label className="flex items-center gap-1 text-xs text-[#4B5563]">
        <span className="font-semibold text-[#4B5563]">From</span>
        <DatePicker
          className="h-7 w-[120px]"
          value={fromDate ?? ""}
          onChange={handleFromDateChange}
          aria-label="From date"
          data-testid={`${testIdPrefix}-filter-from`}
        />
      </label>
      <label className="flex items-center gap-1 text-xs text-[#4B5563]">
        <span className="font-semibold text-[#4B5563]">To</span>
        <DatePicker
          className="h-7 w-[120px]"
          value={toDate ?? ""}
          onChange={handleToDateChange}
          aria-label="To date"
          data-testid={`${testIdPrefix}-filter-to`}
        />
      </label>
      <div className="flex items-center gap-1">
        {PRESET_BUTTONS.map((btn) => (
          <button
            key={btn.preset}
            type="button"
            onClick={() => handlePreset(btn.preset)}
            className="h-7 rounded-sm border border-[#E5E7EB] bg-white px-2 text-xs font-medium text-[#1F2A44] hover:bg-[#F7F8FA]"
            data-testid={`${testIdPrefix}-preset-${btn.preset}`}
          >
            {btn.label}
          </button>
        ))}
      </div>
      <div className="mx-1 h-5 w-px bg-[#E5E7EB]" />
      <label className="flex items-center gap-1 text-xs text-[#4B5563]">
        <span className="font-semibold text-[#4B5563]">Search</span>
        <input
          type="text"
          value={search ?? ""}
          onChange={handleSearch}
          placeholder="Search…"
          className="h-8.5 w-[160px] rounded-sm border border-[#E5E7EB] px-2 text-xs text-[#1F2A44] placeholder:text-[#9CA3AF]"
          data-testid={`${testIdPrefix}-filter-search`}
        />
      </label>
      {children ? (
        <>
          <div className="mx-1 h-5 w-px bg-[#E5E7EB]" />
          {children}
        </>
      ) : null}
      {statusOptions && statusOptions.length > 0 ? (
        <>
          <div className="mx-1 h-5 w-px bg-[#E5E7EB]" />
          <label className="flex items-center gap-1 text-xs text-[#4B5563]">
            <span className="font-semibold text-[#4B5563]">Status</span>
            <SelectCombobox
              value={statusFilter ?? ""}
              onChange={handleStatus}
              className="h-7 rounded-sm border border-[#E5E7EB] bg-white px-2 text-xs text-[#1F2A44]"
              data-testid={`${testIdPrefix}-filter-status`}
            >
              <option value="">All</option>
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </SelectCombobox>
          </label>
        </>
      ) : null}
      {onApply ? (
        <>
          <div className="mx-1 h-5 w-px bg-[#E5E7EB]" />
          {onReset ? (
            <button
              type="button"
              onClick={onReset}
              className="h-7 rounded-sm border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#4B5563] hover:bg-[#F7F8FA]"
              data-testid={`${testIdPrefix}-reset`}
            >
              Reset
            </button>
          ) : null}
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="h-7 rounded-sm border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#4B5563] hover:bg-[#F7F8FA]"
              data-testid={`${testIdPrefix}-cancel`}
            >
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            onClick={onApply}
            disabled={applyDisabled}
            className="h-7 rounded-sm border border-[#1F2A44] bg-[#1F2A44] px-3 text-xs font-medium text-white hover:bg-[#14314F] disabled:opacity-50"
            data-testid={`${testIdPrefix}-apply`}
          >
            Apply
          </button>
        </>
      ) : null}
    </div>
  );
}
