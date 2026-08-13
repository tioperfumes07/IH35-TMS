/**
 * UniversalFilterBar — W2-P PLANNER-REDESIGN
 * Shared FilterBar for ALL planner pages.
 * CHROME-05: Period presets + date range live ONLY inside the Filters popover — the
 * shared CollapsedListFilters gold pattern (Dispatch FilterBar), not always-on chrome.
 */

import { DatePicker } from "../../components/forms/DatePicker";
import { CollapsedListFilters } from "../table/CollapsedListFilters";
import { useStagedListFilters } from "../table/useStagedListFilters";

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
  /** Preset the page treats as "no filter applied" for the Filters badge count. Defaults to this_month. */
  defaultPeriod?: PeriodPreset;
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

export function UniversalFilterBar({ value, onChange, summaryText, defaultPeriod = "this_month" }: UniversalFilterBarProps) {
  const initialDates = getPresetDates(defaultPeriod);
  const staged = useStagedListFilters({
    applied: value,
    empty: { ...value, period: defaultPeriod, ...initialDates },
    onApply: onChange,
  });
  const draft = staged.draft;
  const activeCount =
    (value.period !== defaultPeriod ? 1 : 0) +
    (value.period === "custom" && value.from ? 1 : 0) +
    (value.period === "custom" && value.to ? 1 : 0);

  const handlePreset = (preset: PeriodPreset) => {
      if (preset === "custom") {
        staged.setDraft({ ...draft, period: preset });
      } else {
        const { from, to } = getPresetDates(preset);
        staged.setDraft({ ...draft, period: preset, from, to });
      }
    };

  const handleFrom = (from: string) => staged.setDraft({ ...draft, period: "custom", from });
  const handleTo = (to: string) => staged.setDraft({ ...draft, period: "custom", to });

  return (
    <div
      className="flex items-center gap-2 border-b bg-gray-50 px-3 py-2"
      data-planner-filter-toolbar="collapsed"
    >
      <CollapsedListFilters activeFilterCount={activeCount} testIdPrefix="planner" onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}>
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-gray-600">
            Period <span className="font-normal text-gray-400">— currently {PRESET_LABELS[draft.period]}</span>
          </div>
          <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">
            {(Object.keys(PRESET_LABELS) as PeriodPreset[]).map((k) => (
              <button
                key={k}
                type="button"
                className={`rounded-sm border px-2 py-1 text-left text-xs ${
                  draft.period === k ? "border-[#1F2A44] bg-[#1F2A44] text-white" : "border-gray-200 hover:bg-gray-50"
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
              value={draft.from}
              onChange={(next) => handleFrom(next)}
              max={draft.to || undefined}
            />
            <span className="text-xs text-gray-500">To</span>
            <DatePicker
              className="h-[28px] w-32 px-2 text-xs"
              value={draft.to}
              onChange={(next) => handleTo(next)}
              min={draft.from || undefined}
            />
          </div>
        </div>
      </CollapsedListFilters>

      {summaryText ? <div className="ml-auto text-xs text-gray-600">{summaryText}</div> : null}
    </div>
  );
}

export default UniversalFilterBar;
