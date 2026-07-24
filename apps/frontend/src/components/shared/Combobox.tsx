// TODO(P3-T12-followup): Combobox surface is intentionally 3 files for this PR:
// components/Combobox.tsx engine + shared/Combobox.tsx wrapper +
// shared/SelectCombobox.tsx adapter. Collapse to a single shared surface in a
// dedicated follow-up PR; behavior must stay identical.
import {
  Combobox as BaseCombobox,
  type ComboboxOption as BaseOption,
} from "../Combobox";

export type ComboboxOption = {
  value: string;
  label: string;
};

type Props = {
  options: ComboboxOption[];
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  allowAddNew?: boolean;
  onAddNew?: (typedText: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  /** SAF-F31 — pass-through for server-side type-ahead (see components/Combobox.tsx). */
  onSearch?: (query: string) => void;
};

export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  allowAddNew = false,
  onAddNew,
  disabled = false,
  className,
  onSearch,
}: Props) {
  const mapped: BaseOption[] = options.map((option) => ({
    value: option.value,
    label: option.label,
  }));

  return (
    <BaseCombobox
      options={mapped}
      value={value ?? null}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      onSearch={onSearch}
      allowAddNew={
        allowAddNew && onAddNew
          ? {
              label: "+ Add new",
              onAdd: onAddNew,
            }
          : undefined
      }
    />
  );
}
