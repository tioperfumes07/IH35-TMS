import type { AssetLifecycle } from "./types";

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
    <section className="rounded border border-gray-200 bg-white p-3">
      <div className="grid gap-2 md:grid-cols-[220px_1fr]">
        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Lifecycle
          <select
            value={lifecycle}
            onChange={(event) => onLifecycleChange(event.target.value as AssetLifecycle | "all")}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm font-normal text-gray-900"
          >
            {LIFECYCLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Search
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Unit number, VIN, driver, or location"
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm font-normal text-gray-900"
          />
        </label>
      </div>
    </section>
  );
}
