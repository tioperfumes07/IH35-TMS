/** Map FilterBar equipmentType values onto catalog equipment codes/labels (exact normalized tokens). */
const ALIASES: Record<string, ReadonlySet<string>> = {
  reefer: new Set(["reefer", "refrigerated", "refrigerated_van", "reefer_van"]),
  dry_van: new Set(["dry", "dry_van", "dryvan"]),
  flatbed: new Set(["flat", "flatbed", "flat_bed"]),
  step_deck: new Set(["step", "step_deck", "stepdeck", "step_deck"]),
};

function norm(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** True when row equipment matches the FilterBar equipmentType (or filter is unset). Exact alias only — no substring cross-type hits. */
export function matchesEquipmentType(
  equipmentType: string | undefined,
  codeOrLabel: string | null | undefined,
): boolean {
  if (!equipmentType) return true;
  const aliases = ALIASES[equipmentType] ?? new Set([norm(equipmentType)]);
  const token = norm(String(codeOrLabel ?? ""));
  if (!token) return false;
  return aliases.has(token);
}
