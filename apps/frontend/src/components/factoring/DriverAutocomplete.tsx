import { useCallback } from "react";
import { entityLabel } from "../../lib/entity-label";
import { getDriver } from "../../api/mdata";
import { EntityPicker } from "../parity/EntityPicker";

type Props = {
  companyId: string;
  value: string;
  onChange: (
    driverId: string,
    driverName: string,
    meta?: { default_expense_account_id?: string | null },
  ) => void;
  placeholder?: string;
  // Optional page size — retained for call-site compat; EntityPicker uses registry limit.
  limit?: number;
  /**
   * When set, inline "+ Create driver" is offered (bank categorize / split-line linkage).
   * Omitted → lookup-only (e.g. FactoringHome vendor-merge picker).
   */
  onRequestCreate?: () => void;
  /** CHROME-11: nested create inside an open money ParityDrawer. */
  nestedInDrawer?: boolean;
};

/** Banking/factoring — EntityPicker kind=driver + driver meta for default_expense_account_id (§9.0 item 17). */
export function DriverAutocomplete({
  companyId,
  value,
  onChange,
  placeholder = "Search driver by name",
  onRequestCreate,
  nestedInDrawer = false,
}: Props) {
  const handleChange = useCallback(
    async (next: string | null) => {
      if (!next) {
        onChange("", "", { default_expense_account_id: null });
        return;
      }
      try {
        const driver = await getDriver(next, companyId);
        const name = [driver.first_name, driver.last_name].filter(Boolean).join(" ").trim() || next;
        onChange(next, name, { default_expense_account_id: driver.default_expense_account_id ?? null });
      } catch {
        onChange(next, entityLabel(null, next, "Driver"), { default_expense_account_id: null });
      }
    },
    [companyId, onChange]
  );

  return (
    <div className="space-y-1" data-driver-autocomplete="true">
      <EntityPicker
        kind="driver"
        operatingCompanyId={companyId}
        value={value || null}
        onChange={handleChange}
        placeholder={placeholder}
        allowCreate={onRequestCreate !== undefined}
        nestedInDrawer={nestedInDrawer}
        allowClear
        dataTestId="driver-autocomplete-picker"
      />
    </div>
  );
}
