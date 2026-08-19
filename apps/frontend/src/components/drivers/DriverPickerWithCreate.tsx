import { EntityPicker, type EntityPickerProps } from "../parity/EntityPicker";

export type DriverPickerWithCreateProps = {
  operatingCompanyId: string;
  value: string | null;
  selectedOption?: EntityPickerProps["selectedOption"];
  onChange: EntityPickerProps["onChange"];
  /** When false, skips the roster query (parent surface closed). Default true. */
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
  /**
   * FAIL-CA1: money create surfaces must include Probation (driver create default). Dispatch/Book
   * keep default `active_only`.
   */
  driverRoster?: "active_only" | "active_or_probation";
};

/** mdata.drivers exposes first_name + last_name only. EntityPicker kind=driver uses this shape. */
export function driverPickerDisplayLabel(driver: {
  first_name?: string | null;
  last_name?: string | null;
}): string {
  return [driver.first_name, driver.last_name].filter(Boolean).join(" ").trim();
}

/**
 * EP-DRIVER-KIND-SWEEP §9.0 item 17 — thin EntityPicker kind=driver wrapper.
 * All create-worthy driver fields must route through EntityPicker (server search + inline create).
 */
export function DriverPickerWithCreate({
  operatingCompanyId,
  value,
  selectedOption,
  onChange,
  open = true,
  enabled,
  shell = "modal",
  placeholder = "Select driver",
  className,
  disabled = false,
  allowClear = true,
  dataField,
  driverRoster = "active_only",
}: DriverPickerWithCreateProps) {
  const queryEnabled = (enabled ?? true) && open && Boolean(operatingCompanyId);

  return (
    <EntityPicker
      kind="driver"
      operatingCompanyId={operatingCompanyId}
      value={value}
      selectedOption={selectedOption}
      onChange={onChange}
      enabled={queryEnabled}
      nestedInDrawer={shell === "drawer"}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      allowClear={allowClear}
      dataField={dataField}
      driverRoster={driverRoster}
    />
  );
}
