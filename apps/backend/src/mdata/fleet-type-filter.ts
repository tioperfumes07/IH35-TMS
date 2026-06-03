import { z } from "zod";

export const FLEET_TYPE_FILTER_VALUES = [
  "Truck",
  "Tractor",
  "Reefer",
  "DryVan",
  "Flatbed",
  "Stepdeck",
  "Lowboy",
  "Tanker",
  "Custom",
] as const;

export type FleetTypeFilter = (typeof FLEET_TYPE_FILTER_VALUES)[number];

export const fleetTypeFilterSchema = z.enum(FLEET_TYPE_FILTER_VALUES);

const TRAILER_EQUIPMENT_TYPES = new Set(["Reefer", "DryVan", "Flatbed", "Stepdeck", "Lowboy", "Tanker"]);

export function isTrailerTypeFilter(type: FleetTypeFilter): boolean {
  return TRAILER_EQUIPMENT_TYPES.has(type) || type === "Custom";
}

export function equipmentTypeForFilter(type: FleetTypeFilter): string {
  return type === "Stepdeck" ? "StepDeck" : type;
}

/** SQL fragment excluding all trucks when filtering by trailer equipment type. */
export function truckTypeSqlFilter(type: FleetTypeFilter): string {
  if (type === "Truck") {
    return `(vehicle_type IS NULL OR TRIM(COALESCE(vehicle_type, '')) = '' OR vehicle_type NOT ILIKE '%tractor%')`;
  }
  if (type === "Tractor") {
    return `vehicle_type ILIKE '%tractor%'`;
  }
  if (isTrailerTypeFilter(type)) {
    return "FALSE";
  }
  return "TRUE";
}

/** SQL fragment excluding all trailers when filtering by truck type. */
export function trailerTypeSqlFilter(type: FleetTypeFilter, values: unknown[]): string {
  if (type === "Truck" || type === "Tractor") {
    return "FALSE";
  }
  if (type === "Custom") {
    return `(equipment_type IN ('Other', 'Conestoga', 'RGN', 'Container', 'Chassis')
      OR equipment_type IS NULL
      OR equipment_type NOT IN ('DryVan', 'Reefer', 'Flatbed', 'Tanker', 'StepDeck', 'Lowboy'))`;
  }
  values.push(equipmentTypeForFilter(type));
  return `equipment_type = $${values.length}`;
}
