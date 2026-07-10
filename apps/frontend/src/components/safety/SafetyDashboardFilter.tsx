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
  // S-04: additive From/To date-range pickers alongside the existing 7d/10d/30d/90d/All window toggle.
  // Optional — omitting them (existing callers/tests) renders the bar exactly as before.
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
  return (
    <div className="space-y-0 border-b border-gray-200 bg-gray-50 px-[22px] py-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-500">Activity window:</span>
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
        {showDateRange ? (
          <div className="ml-2 flex items-center gap-1.5 border-l border-gray-300 pl-2">
            <span className="font-semibold text-slate-500">From:</span>
            <DatePicker
              value={fromDate ?? ""}
              onChange={(next) => onFromDateChange?.(next)}
              className="w-32"
              max={toDate || undefined}
              data-testid="safety-from-date"
            />
            <span className="font-semibold text-slate-500">To:</span>
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
                Clear
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-500">Status:</span>
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
        {countsReported ? (
          <span className="ml-auto text-slate-400" data-testid="safety-counter-line">
            {shown} active · {hidden} resolved · {total} total · window {activityWindow}
          </span>
        ) : null}
      </div>
    </div>
  );
}
