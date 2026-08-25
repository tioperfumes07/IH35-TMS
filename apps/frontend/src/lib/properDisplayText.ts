import { humanizeEnumLabel } from "./humanizeEnumLabel";

/** Combobox / filter labels: no snake_case, first letter capitalized. */
export function properEnumOrFilterLabel(value: unknown): string {
  return humanizeEnumLabel(value);
}

/**
 * Title-case a person/place/company string for create + list display.
 * Leaves ALL-CAPS tokens (TX, IH35) and existing mixed names mostly intact.
 */
export function properPersonOrPlaceName(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw === raw.toUpperCase() && raw.length <= 6) return raw;
  return raw
    .split(/(\s+)/)
    .map((part) => {
      if (!part.trim()) return part;
      if (part === part.toUpperCase() && part.length <= 5) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("");
}
