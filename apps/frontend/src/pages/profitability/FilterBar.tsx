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
  return (
    <div className="flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-white p-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">From</label>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={e => onChange({ ...filters, dateFrom: e.target.value })}
          className="w-[130px] min-h-11 text-sm border rounded px-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">To</label>
        <input
          type="date"
          value={filters.dateTo}
          onChange={e => onChange({ ...filters, dateTo: e.target.value })}
          className="w-[130px] min-h-11 text-sm border rounded px-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">Equipment</label>
        <select
          value={filters.equipmentType || ""}
          onChange={e => onChange({ ...filters, equipmentType: e.target.value || undefined })}
          className="w-[120px] min-h-11 text-sm border rounded px-2"
        >
          {EQUIPMENT_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <button className="min-h-11 px-3 text-sm border rounded hover:bg-gray-50 ml-auto">
        Export
      </button>
    </div>
  );
}
