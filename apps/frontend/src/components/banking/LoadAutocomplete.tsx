import { EntityPicker } from "../parity/EntityPicker";

type Props = {
  companyId: string;
  value: string;
  onChange: (loadId: string, loadLabel: string) => void;
  placeholder?: string;
};

/**
 * Bank-transaction categorization trip/load picker.
 * SAF-B29: EntityPicker kind=load (server search) — never custom listLoads dropdown.
 * Wrapper keeps the (id, label) onChange contract used by BankingTransactionsDesignView / split modal.
 */
export function LoadAutocomplete({
  companyId,
  value,
  onChange,
  placeholder = "Search trip / load (optional)",
}: Props) {
  return (
    <div className="space-y-1" data-load-autocomplete="true">
      <EntityPicker
        kind="load"
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
