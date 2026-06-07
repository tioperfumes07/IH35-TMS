import type { ActiveFilter, ListViewFilter } from "../types";
import { FilterPopover } from "./FilterPopover";

interface Props {
  filters: ListViewFilter[];
  activeFilters: ActiveFilter[];
  rows: Record<string, unknown>[];
  onSetFilter: (filterId: string, values: string[]) => void;
  onClearAll: () => void;
  slot?: React.ReactNode;
}

export function ListViewFilterBar({ filters, activeFilters, rows, onSetFilter, onClearAll, slot }: Props) {
  const hasActive = activeFilters.some((f) => f.values.length > 0);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {filters.map((filter) => {
        const active = activeFilters.find((f) => f.filterId === filter.id);
        return (
          <FilterPopover
            key={filter.id}
            filter={filter}
            activeValues={active?.values ?? []}
            onChange={(values) => onSetFilter(filter.id, values)}
            rows={rows}
          />
        );
      })}
      {hasActive && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs text-gray-500 hover:text-red-600 px-1"
        >
          Clear all
        </button>
      )}
      {slot}
    </div>
  );
}
