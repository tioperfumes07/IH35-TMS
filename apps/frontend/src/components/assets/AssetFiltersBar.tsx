import type { AssetLifecycle } from "./types";
import { CollapsedListFilters } from "../table";

type Props = {
  lifecycle: AssetLifecycle | "all";
  search: string;
  onLifecycleChange: (value: AssetLifecycle | "all") => void;
  onSearchChange: (value: string) => void;
};

const LIFECYCLE_OPTIONS: Array<{ value: AssetLifecycle | "all"; label: string }> = [
  { value: "all", label: "All lifecycle states" },
  { value: "active", label: "Active" },
  { value: "maintenance", label: "Maintenance" },
  { value: "out_of_service", label: "Out of service" },
];

export function AssetFiltersBar({ lifecycle, search, onLifecycleChange, onSearchChange }: Props) {
  return (
    <section data-asset-filter-toolbar="collapsed">
      <CollapsedListFilters
        activeFilterCount={lifecycle !== "all" ? 1 : 0}
        testIdPrefix="assets"
        searchSlot={
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Unit number, VIN, driver, or location"
            className="h-8 w-64 rounded-sm border border-gray-300 px-2 text-sm font-normal text-gray-900"
            aria-label="Search assets"
          />
        }
      >
        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Lifecycle
          <select
            value={lifecycle}
            onChange={(event) => onLifecycleChange(event.target.value as AssetLifecycle | "all")}
            className="w-full rounded-sm border border-gray-300 px-2 py-1 text-sm font-normal text-gray-900"
          >
            {LIFECYCLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </CollapsedListFilters>
    </section>
  );
}
