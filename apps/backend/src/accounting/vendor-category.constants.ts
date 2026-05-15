/**
 * Allowed values for mdata.vendors.vendor_category (see db/migrations/0174_vendor_categorization.sql).
 */
export const VENDOR_CATEGORY_VALUES = [
  "diesel",
  "def",
  "repairs_maintenance",
  "road_service",
  "meals_entertainment",
  "driver",
  "washout",
  "lumpers",
  "insurance",
  "tolls",
  "parking",
  "permits",
  "taxes",
  "professional_services",
  "utilities",
  "rent",
  "office_supplies",
  "software",
  "other",
] as const;

export type VendorCategoryValue = (typeof VENDOR_CATEGORY_VALUES)[number];
