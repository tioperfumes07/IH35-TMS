import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { CollapsedListFilters, useStagedListFilters } from "../../../components/table";

type Props = {
  withinHours: number;
  severityMin: "info" | "warning" | "severe";
  includeAlreadyArrived: boolean;
  includeNonYard: boolean;
  counts: Record<string, number>;
  onWithinHoursChange: (value: number) => void;
  onSeverityMinChange: (value: "info" | "warning" | "severe") => void;
  onIncludeAlreadyArrivedChange: (value: boolean) => void;
  onIncludeNonYardChange: (value: boolean) => void;
};

export function ArrivingSoonFilterBar({
  withinHours,
  severityMin,
  includeAlreadyArrived,
  includeNonYard,
  counts,
  onWithinHoursChange,
  onSeverityMinChange,
  onIncludeAlreadyArrivedChange,
  onIncludeNonYardChange,
}: Props) {
  const staged = useStagedListFilters({
    applied: { withinHours, severityMin, includeAlreadyArrived, includeNonYard },
    empty: { withinHours: 48, severityMin: "info" as const, includeAlreadyArrived: false, includeNonYard: false },
    onApply: (next) => {
      onWithinHoursChange(next.withinHours);
      onSeverityMinChange(next.severityMin);
      onIncludeAlreadyArrivedChange(next.includeAlreadyArrived);
      onIncludeNonYardChange(next.includeNonYard);
    },
  });
  const draft = staged.draft;
  const activeFilterCount =
    (withinHours !== 48 ? 1 : 0) +
    (severityMin !== "info" ? 1 : 0) +
    (includeAlreadyArrived ? 1 : 0) +
    (includeNonYard ? 1 : 0);

  return (
    <div className="space-y-2 text-xs" data-arriving-soon-filter-toolbar="collapsed">
      <CollapsedListFilters activeFilterCount={activeFilterCount} testIdPrefix="arriving-soon" onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <label className="space-y-1">
            <span className="text-gray-600">Within next</span>
            <SelectCombobox className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" value={draft.withinHours} onChange={(e) => staged.setDraft({ ...draft, withinHours: Number(e.target.value) })}>
              <option value={24}>24h</option>
              <option value={48}>48h</option>
              <option value={168}>7 days</option>
            </SelectCombobox>
          </label>
          <label className="space-y-1">
            <span className="text-gray-600">Severity</span>
            <SelectCombobox
              className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm"
              value={draft.severityMin}
              onChange={(e) => staged.setDraft({ ...draft, severityMin: e.target.value as "info" | "warning" | "severe" })}
            >
              <option value="info">All</option>
              <option value="warning">Warning+</option>
              <option value="severe">Severe only</option>
            </SelectCombobox>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.includeAlreadyArrived} onChange={(e) => staged.setDraft({ ...draft, includeAlreadyArrived: e.target.checked })} />
            Include already-arrived
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.includeNonYard} onChange={(e) => staged.setDraft({ ...draft, includeNonYard: e.target.checked })} />
            Include non-yard destinations
          </label>
        </div>
      </CollapsedListFilters>
      <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-900">
        {counts.total ?? 0} units arriving · {counts.severe ?? 0} severe · {counts.warning ?? 0} warning · {counts.already_arrived ?? 0} already at yard
      </div>
    </div>
  );
}
