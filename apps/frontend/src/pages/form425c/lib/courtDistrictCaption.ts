/** Court caption from profile fields only. Empty division/district must not become " Division ·  District". */
export function courtDistrictCaption(division: unknown, district: unknown): string {
  const div = String(division ?? "").trim();
  const dist = String(district ?? "").trim();
  if (!div || !dist) return "";
  return `${div} Division · ${dist} District`;
}
