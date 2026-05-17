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
      allowAddNew={
        allowAddNew && onAddNew
          ? {
              label: "Add new",
              onAdd: onAddNew,
            }
          : undefined
      }
    />
  );
}
