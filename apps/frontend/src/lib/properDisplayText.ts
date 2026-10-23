import { humanizeEnumLabel } from "./humanizeEnumLabel";
import { formatPersonName } from "./formatPersonName";

/** Combobox / filter labels: no snake_case, first letter capitalized. */
export function properEnumOrFilterLabel(value: unknown): string {
  return humanizeEnumLabel(value);
}

/**
 * Title-case a person/place/company string for create + list display.
 * ROUND 443.258-B — delegates to the shared formatPersonName() (exceptions in one file).
 */
export function properPersonOrPlaceName(value: unknown): string {
  return formatPersonName(value == null ? "" : String(value));
}
