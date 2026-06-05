import { SelectCombobox } from "../shared/SelectCombobox";

export type CategoryOption = {
  id: string;
  label: string;
};

type Props = {
  value: string;
  options: CategoryOption[];
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  onChange: (categoryId: string) => void;
  onActivate?: () => void;
  onSearchChange?: (search: string) => void;
  searchValue?: string;
};

export function CategoryCombobox({
  value,
  options,
  loading = false,
  disabled = false,
  className,
  onChange,
  onActivate,
  onSearchChange,
  searchValue = "",
}: Props) {
  return (
    <div className="space-y-1" onFocusCapture={() => onActivate?.()}>
      {onSearchChange ? (
        <input
          type="search"
          className="w-full rounded border px-2 py-1 text-sm"
          placeholder="Filter accounts…"
          value={searchValue}
          disabled={disabled}
          onChange={(event) => onSearchChange(event.target.value)}
          onFocus={() => onActivate?.()}
        />
      ) : null}
      <SelectCombobox
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={className}
      >
        <option value="">{loading ? "Loading accounts…" : "Select category…"}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </SelectCombobox>
    </div>
  );
}
