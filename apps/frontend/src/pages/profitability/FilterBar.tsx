import { DatePicker } from "../../components/forms/DatePicker";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";

interface FilterBarProps {
  filters: {
    dateFrom: string;
    dateTo: string;
    equipmentType?: string;
    customerId?: string;
    laneKey?: string;
  };
  onChange: (filters: FilterBarProps["filters"]) => void;
}

const EQUIPMENT_TYPES = [
  { label: "All", value: "" },
  { label: "Reefer", value: "reefer" },
  { label: "Dry Van", value: "dry_van" },
  { label: "Flatbed", value: "flatbed" },
  { label: "Step Deck", value: "step_deck" },
];

export function FilterBar({ filters, onChange }: FilterBarProps) {
  const staged = useStagedListFilters({
    applied: filters,
    empty: { ...filters, dateFrom: "", dateTo: "", equipmentType: undefined },
    onApply: onChange,
  });
  const draft = staged.draft;
  const activeFilterCount =
    (filters.dateFrom || filters.dateTo ? 1 : 0) + (filters.equipmentType ? 1 : 0);

  return (
    <div className="flex flex-wrap items-end gap-3" data-profitability-filter-toolbar="collapsed">
      <CollapsedListFilters activeFilterCount={activeFilterCount} testIdPrefix="profitability" onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">From</label>
            <DatePicker
              value={draft.dateFrom}
              onChange={(next) => staged.setDraft({ ...draft, dateFrom: next })}
              className="w-[130px] min-h-11 text-sm border rounded-sm px-2"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">To</label>
            <DatePicker
              value={draft.dateTo}
              onChange={(next) => staged.setDraft({ ...draft, dateTo: next })}
              className="w-[130px] min-h-11 text-sm border rounded-sm px-2"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Equipment</label>
            <select
              value={draft.equipmentType || ""}
              onChange={(e) => staged.setDraft({ ...draft, equipmentType: e.target.value || undefined })}
              className="w-[120px] min-h-11 text-sm border rounded-sm px-2"
            >
              {EQUIPMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CollapsedListFilters>

      <button type="button" className="min-h-11 px-3 text-sm border rounded-sm hover:bg-gray-50 ml-auto">
        Export
      </button>
    </div>
  );
}
