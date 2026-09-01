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
  /** Engine loading spinner. FuelPlannerHome passes loading=; omitting it is SPA TS2322. */
  loading?: boolean;
  /** SAF-F31 — pass-through for server-side type-ahead (see components/Combobox.tsx). */
  onSearch?: (query: string) => void;
  /** C1-A11Y — forwarded to the input so `<label htmlFor>` actually binds. See components/Combobox.tsx. */
  id?: string;
  /**
   * FLT-01-COMBOBOX-SWEEP-ARIA-TESTID-GAP: this thin wrapper (see the file-level TODO on the
   * 3-file Combobox surface) previously had neither of these in its own Props at all, even though
   * the real engine (components/Combobox.tsx) has always supported both -- silently stranding
   * SelectCombobox.tsx's own forwarding attempt.
   */
  ariaLabel?: string;
  dataTestId?: string;
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
  id,
  loading,
  ariaLabel,
  dataTestId,
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
      id={id}
      loading={loading}
      ariaLabel={ariaLabel}
      dataTestId={dataTestId}
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
