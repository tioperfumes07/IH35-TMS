import { DatePicker } from "../forms/DatePicker";
import { CollapsedListFilters } from "../table/CollapsedListFilters";
import { useStagedListFilters } from "../table/useStagedListFilters";

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
 * CHROME-02: delegates to the shared CollapsedListFilters gold pattern (same component the
 * Dispatch FilterBar uses) instead of re-forking its own filtersOpen/popover chrome.
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
  const staged = useStagedListFilters({
    applied: { value, activityWindow, fromDate: fromDate ?? "", toDate: toDate ?? "" },
    empty: { value: "active" as SafetyDriverFilter, activityWindow: "7d" as SafetyActivityWindow, fromDate: "", toDate: "" },
    onApply: (next) => {
      onChange(next.value);
      onActivityWindowChange(next.activityWindow);
      onFromDateChange?.(next.fromDate);
      onToDateChange?.(next.toDate);
    },
  });
  const draft = staged.draft;
  const hidden = Math.max(0, total - shown);
  const showDateRange = Boolean(onFromDateChange && onToDateChange);

  const activeCount =
    (value !== "active" ? 1 : 0) +
    (activityWindow !== "7d" ? 1 : 0) +
    (fromDate ? 1 : 0) +
    (toDate ? 1 : 0);

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-[22px] py-2 text-[11px]"
      data-safety-filter-toolbar="collapsed"
    >
      <CollapsedListFilters activeFilterCount={activeCount} testIdPrefix="safety" onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}>
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-gray-600">Activity window</div>
            <div className="flex flex-wrap items-center gap-2">
              {WINDOW_OPTIONS.map((option) => {
                const active = option.id === draft.activityWindow;
                return (
                  <button
                    key={option.id}
                    type="button"
                    data-testid={`safety-window-${option.id}`}
                    onClick={() => staged.setDraft({ ...draft, activityWindow: option.id })}
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
                const active = option.id === draft.value;
                return (
                  <button
                    key={option.id}
                    type="button"
                    data-testid={`safety-status-${option.id}`}
                    onClick={() => staged.setDraft({ ...draft, value: option.id })}
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
                <label htmlFor="safety-from-date" className="text-slate-500">From</label>
                <DatePicker
                  id="safety-from-date"
                  value={draft.fromDate}
                  onChange={(next) => staged.setDraft({ ...draft, fromDate: next })}
                  className="w-32"
                  max={draft.toDate || undefined}
                  data-testid="safety-from-date"
                />
                <label htmlFor="safety-to-date" className="text-slate-500">To</label>
                <DatePicker
                  id="safety-to-date"
                  value={draft.toDate}
                  onChange={(next) => staged.setDraft({ ...draft, toDate: next })}
                  className="w-32"
                  min={draft.fromDate || undefined}
                  data-testid="safety-to-date"
                />
                {draft.fromDate || draft.toDate ? (
                  <button
                    type="button"
                    className="rounded-full border border-gray-300 px-2 py-0.5 text-slate-500 hover:bg-gray-100"
                    onClick={() => {
                      staged.setDraft({ ...draft, fromDate: "", toDate: "" });
                    }}
                  >
                    Clear dates
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
      </CollapsedListFilters>
      {countsReported ? (
        <span className="ml-auto text-slate-400" data-testid="safety-counter-line">
          {shown} active · {hidden} resolved · {total} total · window {activityWindow}
        </span>
      ) : null}
    </div>
  );
}
