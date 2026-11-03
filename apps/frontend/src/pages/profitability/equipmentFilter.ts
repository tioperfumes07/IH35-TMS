/** Map FilterBar equipmentType values onto catalog equipment codes/labels. */
const ALIASES: Record<string, string[]> = {
  reefer: ["reefer", "refrigerated", "refrigerated_van", "reefer_van"],
  dry_van: ["dry", "dry_van", "dryvan", "van"],
  flatbed: ["flat", "flatbed", "flat_bed"],
  step_deck: ["step", "step_deck", "stepdeck", "step-deck"],
};

function norm(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** True when row equipment matches the FilterBar equipmentType (or filter is unset). */
export function matchesEquipmentType(
  equipmentType: string | undefined,
  codeOrLabel: string | null | undefined,
): boolean {
  if (!equipmentType) return true;
  const aliases = ALIASES[equipmentType] ?? [norm(equipmentType)];
  const token = norm(String(codeOrLabel ?? ""));
  if (!token) return false;
  return aliases.some((a) => token === a || token.includes(a) || a.includes(token));
}
