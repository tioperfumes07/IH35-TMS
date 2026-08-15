import type { AssetLifecycle } from "./types";
import { CollapsedListFilters, useStagedListFilters } from "../table";

type Props = {
  lifecycle: AssetLifecycle | "all";
  onLifecycleChange: (value: AssetLifecycle | "all") => void;
};

const LIFECYCLE_OPTIONS: Array<{ value: AssetLifecycle | "all"; label: string }> = [
  { value: "all", label: "All lifecycle states" },
  { value: "active", label: "Active" },
  { value: "maintenance", label: "Maintenance" },
  { value: "out_of_service", label: "Out of service" },
];

export function AssetFiltersBar({ lifecycle, onLifecycleChange }: Props) {
  // Free-text search: AssetListTable ParityTable owns it (ASSET-F3482) — no searchSlot here.
  const staged = useStagedListFilters({
    applied: { lifecycle },
    empty: { lifecycle: "all" as const },
    onApply: (next) => onLifecycleChange(next.lifecycle),
  });
  return (
    <section data-asset-filter-toolbar="collapsed">
      <CollapsedListFilters
        activeFilterCount={lifecycle !== "all" ? 1 : 0}
        testIdPrefix="assets"
        onApply={staged.apply}
        onReset={staged.reset}
        onCancel={staged.cancel}
        applyDisabled={!staged.dirty}
      >
        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Lifecycle
          <select
            value={staged.draft.lifecycle}
            onChange={(event) => staged.setDraft({ lifecycle: event.target.value as AssetLifecycle | "all" })}
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
