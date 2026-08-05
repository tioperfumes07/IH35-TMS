import { EntityPicker } from "../parity/EntityPicker";

type Props = {
  companyId: string;
  value: string;
  onChange: (trailerId: string, trailerLabel: string) => void;
  placeholder?: string;
};

/**
 * Bank-transaction categorization trailer picker.
 * SAF-B29: EntityPicker kind=trailer (server search) — never custom listUnits(include:trailers) dropdown.
 * Wrapper keeps the (id, label) onChange contract used by BankingTransactionsDesignView / split modal.
 */
export function TrailerAutocomplete({
  companyId,
  value,
  onChange,
  placeholder = "Search trailer (optional)",
}: Props) {
  return (
    <div className="space-y-1" data-trailer-autocomplete="true">
      <EntityPicker
        kind="trailer"
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
