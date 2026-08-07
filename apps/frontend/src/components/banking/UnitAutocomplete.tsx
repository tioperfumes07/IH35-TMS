import { EntityPicker } from "../parity/EntityPicker";

type Props = {
  companyId: string;
  value: string;
  onChange: (unitId: string, unitLabel: string) => void;
  placeholder?: string;
};

/** Banking categorize/split — thin EntityPicker kind=unit wrapper (EP-UNIT-KIND-SWEEP §9.0 item 17). */
export function UnitAutocomplete({ companyId, value, onChange, placeholder = "Search unit (optional)" }: Props) {
  return (
    <div data-unit-autocomplete="true">
      <EntityPicker
        kind="unit"
        operatingCompanyId={companyId}
        value={value || null}
        onChange={(next) => onChange(next ?? "", next ?? "")}
        placeholder={placeholder}
        allowClear
        dataTestId="unit-autocomplete-picker"
      />
    </div>
  );
}
