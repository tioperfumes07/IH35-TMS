import { companyToday, addDaysIso, monthBoundsIso } from "../../lib/businessDate";
import { DatePicker } from "./DatePicker";

// FILTER-MULTI-01: the ONE date-range control every money list gets — From/To fields plus quick
// presets, so a page never grows a second, competing range picker (ParityTable's own built-in
// Range popover is suppressed via `suppressToolbarRange` wherever this is mounted). Dates are
// "YYYY-MM-DD" local-date strings, matching DatePicker's own contract.
export type DateRangePresetsProps = {
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
  className?: string;
  "data-testid"?: string;
};

function isoDaysAgo(days: number): string {
  return addDaysIso(companyToday(), -days);
}

function isoToday(): string {
  return companyToday();
}

function isoStartOfMonth(monthsAgo = 0): string {
  let start = monthBoundsIso(companyToday()).start;
  for (let month = 0; month < monthsAgo; month++) start = monthBoundsIso(addDaysIso(start, -1)).start;
  return start;
}

function isoEndOfLastMonth(): string {
  return addDaysIso(monthBoundsIso(companyToday()).start, -1);
}

const PRESETS: { label: string; range: () => { from: string; to: string } }[] = [
  { label: "Today", range: () => ({ from: isoToday(), to: isoToday() }) },
  { label: "Last 7 days", range: () => ({ from: isoDaysAgo(6), to: isoToday() }) },
  { label: "Last 30 days", range: () => ({ from: isoDaysAgo(29), to: isoToday() }) },
  { label: "This month", range: () => ({ from: isoStartOfMonth(0), to: isoToday() }) },
  { label: "Last month", range: () => ({ from: isoStartOfMonth(1), to: isoEndOfLastMonth() }) },
];

export function DateRangePresets({ from, to, onChange, className, ...rest }: DateRangePresetsProps) {
  const hasRange = Boolean(from || to);
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`} data-testid={rest["data-testid"]}>
      <span className="text-xs text-gray-600">From</span>
      <DatePicker value={from} onChange={(next) => onChange({ from: next, to })} max={to || undefined} className="w-32" aria-label="Date from" />
      <span className="text-xs text-gray-600">To</span>
      <DatePicker value={to} onChange={(next) => onChange({ from, to: next })} min={from || undefined} className="w-32" aria-label="Date to" />
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
            onClick={() => onChange(p.range())}
          >
            {p.label}
          </button>
        ))}
        {hasRange ? (
          <button
            type="button"
            className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
            onClick={() => onChange({ from: "", to: "" })}
            data-testid="date-range-clear"
          >
            Clear dates
          </button>
        ) : null}
      </div>
    </div>
  );
}
