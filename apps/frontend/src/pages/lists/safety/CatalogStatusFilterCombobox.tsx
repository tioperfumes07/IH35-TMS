import { MultiSelectDropdown } from "../../../components/forms/MultiSelectDropdown";
import { STATUS_MULTI_OPTIONS } from "./shared";

/**
 * U12 — office-standard status multi-selector for safety catalog list pages
 * (was Combobox single). Empty selection = all.
 */
export function CatalogStatusFilterCombobox({
  value,
  onChange,
  className = "",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  className?: string;
}) {
  return (
    <div className={`text-xs font-semibold text-[#4B5563] ${className}`.trim()} data-testid="catalog-status-filter">
      <span className="block">Status</span>
      <div className="mt-1">
        <MultiSelectDropdown
          label="Status"
          options={[...STATUS_MULTI_OPTIONS]}
          selected={value}
          onChange={onChange}
          allLabel="All statuses"
          data-testid="catalog-status-multiselect"
        />
      </div>
    </div>
  );
}
