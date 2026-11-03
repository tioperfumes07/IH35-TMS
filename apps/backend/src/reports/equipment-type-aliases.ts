/** FilterBar equipmentType → exact normalized catalog code/label tokens (no substring cross-type). */
export const EQUIPMENT_TYPE_ALIASES: Record<string, readonly string[]> = {
  reefer: ["reefer", "refrigerated", "refrigerated_van", "reefer_van"],
  dry_van: ["dry", "dry_van", "dryvan"],
  flatbed: ["flat", "flatbed", "flat_bed"],
  step_deck: ["step", "step_deck", "stepdeck"],
};

export function resolveEquipmentTypeAliases(equipmentType: string | undefined | null): string[] | null {
  if (!equipmentType) return null;
  const key = equipmentType.trim();
  if (!key) return null;
  const known = EQUIPMENT_TYPE_ALIASES[key];
  if (known) return [...known];
  const norm = key.toLowerCase().replace(/[\s-]+/g, "_");
  return [norm];
}

/**
 * SQL predicate: load row `l` matches equipment aliases via catalogs.load_trailer_equipment.
 * `aliasParam` is the $N placeholder for text[] aliases (e.g. "$4").
 */
export function loadMatchesEquipmentSql(aliasParam: string, loadAlias = "l"): string {
  return `
    EXISTS (
      SELECT 1
        FROM catalogs.load_trailer_equipment lte
       WHERE lte.id = ${loadAlias}.load_trailer_equipment_id
         AND lte.operating_company_id = ${loadAlias}.operating_company_id
         AND (
           regexp_replace(lower(trim(coalesce(lte.code, ''))), '[\\s-]+', '_', 'g') = ANY(${aliasParam}::text[])
           OR regexp_replace(lower(trim(coalesce(lte.display_name, ''))), '[\\s-]+', '_', 'g') = ANY(${aliasParam}::text[])
         )
    )
  `;
}
