import { SelectCombobox } from "../../../components/shared/SelectCombobox";
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
  return (
    <div className="space-y-2 rounded border border-gray-200 bg-white p-3 text-xs">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <label className="space-y-1">
          <span className="text-gray-600">Within next</span>
          <SelectCombobox className="h-8 w-full rounded border border-gray-300 px-2 text-sm" value={withinHours} onChange={(e) => onWithinHoursChange(Number(e.target.value))}>
            <option value={24}>24h</option>
            <option value={48}>48h</option>
            <option value={168}>7 days</option>
          </SelectCombobox>
        </label>
        <label className="space-y-1">
          <span className="text-gray-600">Severity</span>
          <SelectCombobox
            className="h-8 w-full rounded border border-gray-300 px-2 text-sm"
            value={severityMin}
            onChange={(e) => onSeverityMinChange(e.target.value as "info" | "warning" | "severe")}
          >
            <option value="info">All</option>
            <option value="warning">Warning+</option>
            <option value="severe">Severe only</option>
          </SelectCombobox>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeAlreadyArrived} onChange={(e) => onIncludeAlreadyArrivedChange(e.target.checked)} />
          Include already-arrived
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeNonYard} onChange={(e) => onIncludeNonYardChange(e.target.checked)} />
          Include non-yard destinations
        </label>
      </div>
      <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-900">
        {counts.total ?? 0} units arriving · {counts.severe ?? 0} severe · {counts.warning ?? 0} warning · {counts.already_arrived ?? 0} already at yard
      </div>
    </div>
  );
}
