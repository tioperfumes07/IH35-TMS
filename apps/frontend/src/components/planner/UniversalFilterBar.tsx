/**
 * UniversalFilterBar — W2-P PLANNER-REDESIGN
 * Shared FilterBar for ALL planner pages.
 * CHROME-02: Period presets + date range collapse behind Filters popover (QBO-style).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { DatePicker } from "../../components/forms/DatePicker";

export type PeriodPreset =
  | "this_week"
  | "this_month"
  | "this_quarter"
  | "this_year"
  | "ytd"
  | "yesterday"
  | "last_week"
  | "last_month"
  | "last_quarter"
  | "last_year"
  | "since_30"
  | "since_60"
  | "since_90"
  | "next_week"
  | "next_4weeks"
  | "next_month"
  | "next_quarter"
  | "custom";

export interface FilterState {
  period: PeriodPreset;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  equipmentType?: string;
  driverStatus?: string;
}

interface UniversalFilterBarProps {
  value: FilterState;
  onChange: (next: FilterState) => void;
  summaryText?: string;
}

function getPresetDates(preset: PeriodPreset): { from: string; to: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  switch (preset) {
    case "this_week": {
      const start = new Date(today);
      start.setDate(today.getDate() - today.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { from: fmt(start), to: fmt(end) };
    }
    case "this_month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { from: fmt(start), to: fmt(end) };
    }
    case "this_quarter": {
      const q = Math.floor(today.getMonth() / 3);
      const start = new Date(today.getFullYear(), q * 3, 1);
      const end = new Date(today.getFullYear(), q * 3 + 3, 0);
      return { from: fmt(start), to: fmt(end) };
    }
    case "this_year": {
      const start = new Date(today.getFullYear(), 0, 1);
      const end = new Date(today.getFullYear(), 11, 31);
      return { from: fmt(start), to: fmt(end) };
    }
    case "ytd": {
      const start = new Date(today.getFullYear(), 0, 1);
      return { from: fmt(start), to: fmt(today) };
    }
    case "yesterday": {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      return { from: fmt(d), to: fmt(d) };
    }
    case "last_week": {
      const start = new Date(today);
      start.setDate(today.getDate() - today.getDay() - 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { from: fmt(start), to: fmt(end) };
    }
    case "last_month": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: fmt(start), to: fmt(end) };
    }
    case "last_quarter": {
      const q = Math.floor(today.getMonth() / 3) - 1;
      const year = q < 0 ? today.getFullYear() - 1 : today.getFullYear();
      const adjQ = q < 0 ? 3 : q;
      const start = new Date(year, adjQ * 3, 1);
      const end = new Date(year, adjQ * 3 + 3, 0);
      return { from: fmt(start), to: fmt(end) };
    }
    case "last_year": {
      const start = new Date(today.getFullYear() - 1, 0, 1);
      const end = new Date(today.getFullYear() - 1, 11, 31);
      return { from: fmt(start), to: fmt(end) };
    }
    case "since_30": {
      const start = new Date(today);
      start.setDate(today.getDate() - 30);
      return { from: fmt(start), to: fmt(today) };
    }
    case "since_60": {
      const start = new Date(today);
      start.setDate(today.getDate() - 60);
      return { from: fmt(start), to: fmt(today) };
    }
    case "since_90": {
      const start = new Date(today);
      start.setDate(today.getDate() - 90);
      return { from: fmt(start), to: fmt(today) };
    }
    case "next_week": {
      const start = new Date(today);
      start.setDate(today.getDate() - today.getDay() + 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { from: fmt(start), to: fmt(end) };
    }
    case "next_4weeks": {
      const start = new Date(today);
      const end = new Date(today);
      end.setDate(today.getDate() + 28);
      return { from: fmt(start), to: fmt(end) };
    }
    case "next_month": {
      const start = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      return { from: fmt(start), to: fmt(end) };
    }
    case "next_quarter": {
      const q = Math.floor(today.getMonth() / 3) + 1;
      const year = q > 3 ? today.getFullYear() + 1 : today.getFullYear();
      const adjQ = q > 3 ? 0 : q;
      const start = new Date(year, adjQ * 3, 1);
      const end = new Date(year, adjQ * 3 + 3, 0);
      return { from: fmt(start), to: fmt(end) };
    }
    default:
      return { from: fmt(today), to: fmt(today) };
  }
}

const PRESET_LABELS: Record<PeriodPreset, string> = {
  this_week: "This Week",
  this_month: "This Month",
  this_quarter: "This Quarter",
  this_year: "This Year",
  ytd: "YTD",
  yesterday: "Yesterday",
  last_week: "Last Week",
  last_month: "Last Month",
  last_quarter: "Last Quarter",
  last_year: "Last Year",
  since_30: "Since 30 Days",
  since_60: "Since 60 Days",
  since_90: "Since 90 Days",
  next_week: "Next Week",
  next_4weeks: "Next 4 Weeks",
  next_month: "Next Month",
  next_quarter: "Next Quarter",
  custom: "Custom",
};

export function UniversalFilterBar({ value, onChange, summaryText }: UniversalFilterBarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activeCount =
    (value.period !== "this_month" ? 1 : 0) +
    (value.period === "custom" && value.from ? 1 : 0) +
    (value.period === "custom" && value.to ? 1 : 0);

  const handlePreset = useCallback(
    (preset: PeriodPreset) => {
      if (preset === "custom") {
        onChange({ ...value, period: preset });
      } else {
        const { from, to } = getPresetDates(preset);
        onChange({ ...value, period: preset, from, to });
      }
    },
    [value, onChange]
  );

  const handleFrom = (from: string) => onChange({ ...value, period: "custom", from });
  const handleTo = (to: string) => onChange({ ...value, period: "custom", to });

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
      className="relative flex items-center gap-2 border-b bg-gray-50 px-3 py-2"
      data-planner-filter-toolbar="collapsed"
    >
      <span className="text-xs font-medium text-gray-700">{PRESET_LABELS[value.period]}</span>
      <span className="text-xs text-gray-500">
        {value.from} – {value.to}
      </span>

      <button
        type="button"
        aria-expanded={filtersOpen}
        data-testid="planner-filters-toggle"
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

      {summaryText ? <div className="ml-auto text-xs text-gray-600">{summaryText}</div> : null}

      {filtersOpen ? (
        <div
          className="absolute left-3 top-full z-50 mt-1 w-[min(560px,90vw)] space-y-3 rounded-sm border border-gray-200 bg-white p-3 shadow-lg"
          data-testid="planner-filters-panel"
        >
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-gray-600">Period</div>
            <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">
              {(Object.keys(PRESET_LABELS) as PeriodPreset[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`rounded-sm border px-2 py-1 text-left text-xs ${
                    value.period === k ? "border-[#1F2A44] bg-[#1F2A44] text-white" : "border-gray-200 hover:bg-gray-50"
                  }`}
                  onClick={() => handlePreset(k)}
                >
                  {PRESET_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-gray-600">Date range</div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500">From</span>
              <DatePicker
                className="h-[28px] w-32 px-2 text-xs"
                value={value.from}
                onChange={(next) => handleFrom(next)}
                max={value.to || undefined}
              />
              <span className="text-xs text-gray-500">To</span>
              <DatePicker
                className="h-[28px] w-32 px-2 text-xs"
                value={value.to}
                onChange={(next) => handleTo(next)}
                min={value.from || undefined}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default UniversalFilterBar;
