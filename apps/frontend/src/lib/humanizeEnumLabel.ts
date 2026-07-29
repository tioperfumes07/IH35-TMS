/**
 * Turn a machine enum into something an operator can read.
 *
 * Raw enums leaked onto prod screens: the dispatch Fleet OOS strip showed "OutOfService" on 13 units,
 * and three other surfaces used a `?? row.status` fallback that put the enum in front of the user
 * whenever the human field was null.
 *
 * Dropping the value instead would lose real information — often the enum is the ONLY thing recorded.
 * So convert it: PascalCase and snake_case both become sentence case, and an already-human string is
 * returned untouched.
 *
 *   "OutOfService"   -> "Out of service"
 *   "in_maintenance" -> "In maintenance"
 *   "Paid in full"   -> "Paid in full"   (unchanged)
 */
export function humanizeEnumLabel(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  // Already human: contains a space and is not SCREAMING_SNAKE.
  if (/\s/.test(raw) && raw !== raw.toUpperCase()) return raw;

  const spaced = raw
    .replace(/[_-]+/g, " ")
    // split PascalCase / camelCase, keeping acronym runs together (DOTInspection -> DOT Inspection)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
