import { useMemo } from "react";
import { Combobox } from "../Combobox";

// Shared searchable state/province selector. US today; structured by country so MX
// states can be added for USMCA cross-border later. Stores the 2-letter code (e.g. "TX"),
// which fixes free-text bugs like "TEXAS".
//
// SETL-F441 — same Combobox filter chrome as every other form picker (no caret, h-7 sm),
// not a custom button+dropdown that looked taller and showed a caret.
export type StateOption = { code: string; name: string };

export const US_STATES: StateOption[] = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" }, { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" }, { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
  { code: "PR", name: "Puerto Rico" },
];

// MX states (placeholder for USMCA cross-border; wired in once cross-border surfaces need it).
export const MX_STATES: StateOption[] = [];

export const STATES_BY_COUNTRY: Record<string, StateOption[]> = { US: US_STATES, MX: MX_STATES };

type Props = {
  value: string;
  onChange: (code: string) => void;
  country?: "US" | "MX";
  className?: string;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
};

export function StateSelect({ value, onChange, country = "US", className = "", disabled, id, placeholder }: Props) {
  const options = useMemo(() => {
    const list = STATES_BY_COUNTRY[country] ?? US_STATES;
    return list.map((o) => ({ value: o.code, label: `${o.code} — ${o.name}` }));
  }, [country]);

  return (
    <Combobox
      id={id}
      className={className}
      size="sm"
      options={options}
      value={value || null}
      onChange={(code) => onChange(code ?? "")}
      placeholder={placeholder || "State"}
      disabled={disabled}
      allowClear={Boolean(value)}
      filterMode="contains"
      clearCommittedOnEdit
      ariaLabel={placeholder || "State"}
    />
  );
}
