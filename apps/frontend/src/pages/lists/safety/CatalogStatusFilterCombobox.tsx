import { Combobox } from "../../../components/Combobox";
import { FILTER_CONTROL_SIZE_CLASS } from "../../../design/tokens";
import { STATUS_OPTIONS, type StatusFilter } from "./shared";

/** Office-standard status filter (Combobox, not native select) for safety catalog list pages. */
export function CatalogStatusFilterCombobox({
  value,
  onChange,
  className = "",
}: {
  value: StatusFilter;
  onChange: (next: StatusFilter) => void;
  className?: string;
}) {
  return (
    <Combobox
      options={STATUS_OPTIONS.map((row) => ({ value: row.value, label: row.label }))}
      value={value}
      onChange={(next) => onChange((next ?? "true") as StatusFilter)}
      ariaLabel="Status filter"
      className={`${FILTER_CONTROL_SIZE_CLASS} w-full rounded-sm border border-gray-300 px-2 text-sm ${className}`.trim()}
    />
  );
}
