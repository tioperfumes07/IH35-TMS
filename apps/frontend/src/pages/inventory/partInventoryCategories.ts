/**
 * INV-CAT-01 — inventory stock category taxonomy.
 *
 * Canonical store is `maintenance.parts_inventory.category` (INV-1). Legacy seed
 * (0292) parked these tokens in `location`; backfill migration restores them.
 * Do NOT read deprecated empty `catalogs.parts` for options.
 */
export const PART_INVENTORY_CATEGORIES = [
  "air_intake",
  "brake",
  "brake_air_system",
  "brake_system",
  "cab_hvac",
  "cab_safety",
  "cooling",
  "dot_compliance",
  "driveline",
  "electrical",
  "emissions",
  "engine_accessories",
  "engine_lubrication",
  "fuel_system",
  "tires",
  "tires_wheels",
  "transmission",
] as const;

export type PartInventoryCategory = (typeof PART_INVENTORY_CATEGORIES)[number];

export function formatPartInventoryCategoryLabel(code: string): string {
  return code
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** INV-CAT-01: honest display for legacy null/blank category — never an empty table cell. */
export function displayPartInventoryCategory(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return "N/A";
  if ((PART_INVENTORY_CATEGORIES as readonly string[]).includes(trimmed)) {
    return formatPartInventoryCategoryLabel(trimmed);
  }
  return trimmed;
}
