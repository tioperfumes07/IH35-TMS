import { EntityPicker } from "../parity/EntityPicker";

type Props = {
  companyId: string;
  value: string;
  onChange: (unitId: string, unitLabel: string) => void;
  placeholder?: string;
};

/**
 * Bank-transaction categorization unit picker.
 * SAF-B29: EntityPicker kind=unit (server search) — never custom listUnits(limit:500) dropdown.
 * Wrapper keeps the (id, label) onChange contract used by BankingTransactionsDesignView / split modal.
 */
export function UnitAutocomplete({ companyId, value, onChange, placeholder = "Search unit (optional)" }: Props) {
  return (
    <div className="space-y-1" data-unit-autocomplete="true">
      <EntityPicker
        kind="unit"
        operatingCompanyId={companyId}
        value={value || null}
        placeholder={placeholder}
        allowClear
        className="w-full text-xs"
        onChange={(next) => {
          if (!next) {
            onChange("", "");
            return;
          }
          // Label is owned by EntityPicker chrome; callers that only persist the id stay correct.
          onChange(next, next);
        }}
      />
    </div>
  );
}
