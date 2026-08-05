import { EntityPicker } from "../parity/EntityPicker";

export type DriverPickerWithCreateProps = {
  operatingCompanyId: string;
  value: string | null;
  onChange: (driverId: string | null) => void;
  /** When false, skips the drivers query (parent surface closed). Default true. */
  open?: boolean;
  enabled?: boolean;
  /** Parent already a ParityDrawer → pass "drawer". Standalone modal/page → default "modal". */
  shell?: "modal" | "drawer";
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  allowClear?: boolean;
  /** Optional data-field for form validation focus. */
  dataField?: string;
};

/**
 * PLUS-DRIVER-SYSTEM / SAF-B29 — shared driver picker.
 * EntityPicker kind=driver owns server search + inline CreateDriverModal (nestedInDrawer when shell=drawer).
 * Never Combobox + listDrivers(limit:200) — that silently hid drivers past page 1 on every consumer.
 */
export function DriverPickerWithCreate({
  operatingCompanyId,
  value,
  onChange,
  open = true,
  enabled,
  shell = "modal",
  placeholder = "Select driver",
  className,
  disabled = false,
  allowClear = true,
  dataField,
}: DriverPickerWithCreateProps) {
  const queryEnabled = (enabled ?? true) && open && Boolean(operatingCompanyId);

  return (
    <div data-driver-picker-with-create="true">
      <EntityPicker
        kind="driver"
        operatingCompanyId={operatingCompanyId}
        value={value}
        onChange={onChange}
        enabled={queryEnabled}
        placeholder={placeholder}
        className={className}
        disabled={disabled || !operatingCompanyId}
        allowClear={allowClear}
        nestedInDrawer={shell === "drawer"}
        dataField={dataField}
        dataTestId="driver-picker-with-create"
      />
    </div>
  );
}
