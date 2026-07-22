import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDrivers } from "../../api/mdata";
import { Combobox } from "../Combobox";
import { CreateDriverModal } from "./CreateDriverModal";

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
 * PLUS-DRIVER-SYSTEM — shared Combobox + CreateDriverModal gold pattern (VendorBillForm).
 * Prefer this over ad-hoc SelectCombobox/select for create-worthy driver fields.
 * Specialized UIs (InlineDriverPicker, DriverAutocomplete, AssignDriverDropdown) wire
 * CreateDriverModal into those components instead so all consumers inherit.
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
  const [driverCreateOpen, setDriverCreateOpen] = useState(false);
  const queryEnabled = (enabled ?? true) && open && Boolean(operatingCompanyId);

  const driversQuery = useQuery({
    queryKey: ["driver-picker-with-create", operatingCompanyId],
    queryFn: () =>
      listDrivers({
        operating_company_id: operatingCompanyId,
        status: "Active",
        search: "",
        limit: 200,
      }),
    enabled: queryEnabled,
  });

  const driverOptions = useMemo(
    () =>
      (driversQuery.data?.drivers ?? []).map((driver) => ({
        value: driver.id,
        label: [driver.first_name, driver.last_name].filter(Boolean).join(" ").trim() || driver.id,
      })),
    [driversQuery.data?.drivers]
  );

  return (
    <>
      <Combobox
        dataField={dataField}
        className={className}
        options={driverOptions}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        loading={driversQuery.isLoading}
        disabled={disabled || !operatingCompanyId}
        allowClear={allowClear}
        allowAddNew={{
          label: "+ Create driver",
          onAdd: () => setDriverCreateOpen(true),
        }}
      />
      <CreateDriverModal
        open={driverCreateOpen}
        companyId={operatingCompanyId}
        shell={shell}
        onClose={() => setDriverCreateOpen(false)}
        onCreated={(createdId) => {
          onChange(createdId);
          setDriverCreateOpen(false);
          void driversQuery.refetch();
        }}
      />
    </>
  );
}
