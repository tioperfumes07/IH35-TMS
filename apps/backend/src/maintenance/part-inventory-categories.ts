/**
 * INV-CAT-01 — maintenance.parts_inventory.category taxonomy.
 * Must stay in sync with apps/frontend/src/pages/inventory/partInventoryCategories.ts
 */
export const PART_INVENTORY_CATEGORY_VALUES = [
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

export type PartInventoryCategoryValue = (typeof PART_INVENTORY_CATEGORY_VALUES)[number];
