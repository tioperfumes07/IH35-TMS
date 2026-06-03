/** Normalize equipment type code or name for duplicate detection (hyphen form, lowercase). */
export function normalizeEquipmentTypeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, " ")
    .replace(/d$/, "");
}
