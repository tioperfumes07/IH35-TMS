import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { DatePicker } from "../forms/DatePicker";

export type SafetyDriverFilter = "active" | "resolved" | "all";
export type SafetyActivityWindow = "7d" | "10d" | "30d" | "90d" | "all";

type Props = {
  value: SafetyDriverFilter;
  onChange: (next: SafetyDriverFilter) => void;
  activityWindow: SafetyActivityWindow;
  onActivityWindowChange: (next: SafetyActivityWindow) => void;
  shown: number;
  total: number;
  // SM3: the counter line only renders when the active tab has reported counts. Tabs that do not feed
  // the bar therefore show no counter instead of a permanent, misleading "0 active · 0 resolved · 0 total".
  countsReported?: boolean;
  // From/To date-range — live inside the Filters popover (QBO collapse), not as always-on chrome.
  fromDate?: string;
  toDate?: string;
  onFromDateChange?: (next: string) => void;
  onToDateChange?: (next: string) => void;
};

const STATUS_OPTIONS: Array<{ id: SafetyDriverFilter; label: string }> = [
  { id: "active", label: "Active" },
  { id: "resolved", label: "Resolved" },
  { id: "all", label: "All" },
];

const WINDOW_OPTIONS: Array<{ id: SafetyActivityWindow; label: string }> = [
  { id: "7d", label: "7d" },
  { id: "10d", label: "10d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "all", label: "All time" },
];

function pill(active: boolean) {
  return active
    ? { background: "#1f2a44", borderColor: "#1f2a44", color: "white" }
    : { background: "white", borderColor: "#cbd5e1", color: "#475569" };
}

/**
 * CHROME-01 — QBO-style collapse (Dispatch FilterBar pattern).
 * Slim toolbar: Filters button + optional counter. Activity window, Status, From/To live in the popover.
 */
export function SafetyDashboardFilter({
  value,
  onChange,
  activityWindow,
  onActivityWindowChange,
  shown,
  total,
  countsReported = false,
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
}: Props) {
  const hidden = Math.max(0, total - shown);
  const showDateRange = Boolean(onFromDateChange && onToDateChange);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activeCount =
    (value !== "active" ? 1 : 0) +
    (activityWindow !== "7d" ? 1 : 0) +
    (fromDate ? 1 : 0) +
    (toDate ? 1 : 0);

  useEffect(() => {
    if (!filtersOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setFiltersOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [filtersOpen]);

  return (
    <div
      ref={ref}
      className="relative border-b border-gray-200 bg-white px-[22px] py-2 text-[11px]"
      data-safety-filter-toolbar="collapsed"
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-expanded={filtersOpen}
          data-testid="safety-filters-toggle"
          onClick={() => setFiltersOpen((o) => !o)}
          className="flex h-8 items-center gap-1 rounded-sm border border-gray-300 bg-white px-2 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          Filters
          {activeCount > 0 ? (
            <span className="ml-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-[#1F2A44] px-1 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          ) : null}
        </button>
        {countsReported ? (
          <span className="ml-auto text-slate-400" data-testid="safety-counter-line">
            {shown} active · {hidden} resolved · {total} total · window {activityWindow}
          </span>
        ) : null}
      </div>

      {filtersOpen ? (
        <div
          className="absolute left-[22px] z-30 mt-1 w-[min(560px,90vw)] space-y-3 rounded-sm border border-gray-200 bg-white p-3 shadow-lg"
          data-testid="safety-filters-panel"
        >
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-gray-600">Activity window</div>
            <div className="flex flex-wrap items-center gap-2">
              {WINDOW_OPTIONS.map((option) => {
                const active = option.id === activityWindow;
                return (
                  <button
                    key={option.id}
                    type="button"
                    data-testid={`safety-window-${option.id}`}
                    onClick={() => onActivityWindowChange(option.id)}
                    className="rounded-full border px-2.5 py-0.5"
                    style={pill(active)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-gray-600">Status</div>
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_OPTIONS.map((option) => {
                const active = option.id === value;
                return (
                  <button
                    key={option.id}
                    type="button"
                    data-testid={`safety-status-${option.id}`}
                    onClick={() => onChange(option.id)}
                    className="rounded-full border px-2.5 py-0.5"
                    style={pill(active)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {showDateRange ? (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-gray-600">Date range</div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-500">From</span>
                <DatePicker
                  value={fromDate ?? ""}
                  onChange={(next) => onFromDateChange?.(next)}
                  className="w-32"
                  max={toDate || undefined}
                  data-testid="safety-from-date"
                />
                <span className="text-slate-500">To</span>
                <DatePicker
                  value={toDate ?? ""}
                  onChange={(next) => onToDateChange?.(next)}
                  className="w-32"
                  min={fromDate || undefined}
                  data-testid="safety-to-date"
                />
                {fromDate || toDate ? (
                  <button
                    type="button"
                    className="rounded-full border border-gray-300 px-2 py-0.5 text-slate-500 hover:bg-gray-100"
                    onClick={() => {
                      onFromDateChange?.("");
                      onToDateChange?.("");
                    }}
                  >
                    Clear dates
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
