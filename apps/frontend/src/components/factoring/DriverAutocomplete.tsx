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
  // Retained for API compatibility — EntityPicker owns server search + page size.
  limit?: number;
  /**
   * PLUS-DRIVER-MONEY: when set, offer EntityPicker inline "+ Create driver".
   * Banking categorize/split used this for CreateDriverModal; EntityPicker now owns create.
   * FactoringHome vendor-merge omits this (lookup-only).
   */
  onRequestCreate?: () => void;
};

/**
 * Driver picker for bank categorize / factoring merge.
 * SAF-B29: EntityPicker kind=driver (server search) — never custom listDrivers focus dropdown.
 * Wrapper keeps (id, name, meta?) onChange + data-driver-autocomplete for callers.
 */
export function DriverAutocomplete({
  companyId,
  value,
  onChange,
  placeholder = "Search driver by name",
  onRequestCreate,
}: Props) {
  return (
    <div className="space-y-1" data-driver-autocomplete="true">
      <EntityPicker
        kind="driver"
        operatingCompanyId={companyId}
        value={value || null}
        placeholder={placeholder}
        allowClear
        allowCreate={Boolean(onRequestCreate)}
        className="w-full text-xs"
        onChange={(next) => {
          if (!next) {
            onChange("", "", undefined);
            return;
          }
          // Label/meta owned by EntityPicker chrome; callers that only persist the id stay correct.
          // Banking GL prefill from default_expense_account_id is best-effort omitted (same class as
          // UnitAutocomplete label simplification) — operator can still set the account before save.
          onChange(next, next, undefined);
        }}
      />
    </div>
  );
}
