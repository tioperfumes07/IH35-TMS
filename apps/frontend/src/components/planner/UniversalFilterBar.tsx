/**
 * UniversalFilterBar — W2-P PLANNER-REDESIGN
 * Shared FilterBar for ALL planner pages.
 * Period presets (QBO-style), date range, filters.
 * All controls 28px height, content-width (proportionate).
 */

import { useState, useCallback } from "react";
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
  const [isOpen, setIsOpen] = useState(false);

  const handlePreset = useCallback((preset: PeriodPreset) => {
    if (preset === "custom") {
      onChange({ ...value, period: preset });
    } else {
      const { from, to } = getPresetDates(preset);
      onChange({ ...value, period: preset, from, to });
    }
    setIsOpen(false);
  }, [value, onChange]);

  const handleFrom = (from: string) => onChange({ ...value, period: "custom", from });
  const handleTo = (to: string) => onChange({ ...value, period: "custom", to });

  // 28px height, content-width (proportionate), compact layout
  const btnBase = "h-[28px] px-2 text-xs border rounded flex items-center gap-1 bg-white";

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50">
      {/* Period selector — compact dropdown */}
      <div className="relative">
        <button
          type="button"
          className={btnBase}
          onClick={() => setIsOpen((s) => !s)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span>📅</span>
          <span>{PRESET_LABELS[value.period]}</span>
          <span>▼</span>
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-white border rounded shadow-md min-w-[10rem] max-w-[12rem]">
            {(Object.keys(PRESET_LABELS) as PeriodPreset[]).map((k) => (
              <button
                key={k}
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100"
                onClick={() => handlePreset(k)}
              >
                {PRESET_LABELS[k]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* From / To — content-width, not stretchy */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500">From</span>
        <DatePicker
          className="h-[28px] px-2 text-xs border rounded bg-white"
          value={value.from}
          onChange={(next) => handleFrom(next)}
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500">To</span>
        <DatePicker
          className="h-[28px] px-2 text-xs border rounded bg-white"
          value={value.to}
          onChange={(next) => handleTo(next)}
        />
      </div>

      {/* Filters placeholder — add specific filters per planner */}
      <div className="flex items-center gap-2 flex-1">
        <button type="button" className={btnBase}>
          Filters ▼
        </button>
        <button type="button" className={btnBase}>
          Columns ⚙️
        </button>
      </div>

      {/* Right-aligned summary */}
      {summaryText && (
        <div className="text-xs text-gray-600 ml-auto">{summaryText}</div>
      )}
    </div>
  );
}

export default UniversalFilterBar;
