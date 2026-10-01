import { z } from "zod";

export const FLEET_TYPE_FILTER_VALUES = [
  "Truck",
  "Tractor",
  "Trailer",
  "Reefer",
  "DryVan",
  "Flatbed",
  "Stepdeck",
  "Lowboy",
  "Tanker",
  "Custom",
  // E-17 addition: units with no vehicle_type yet -- shown honestly, never folded into "Truck".
  "Unclassified",
] as const;

/** E-17 addition (migration 202615140000): the controlled mdata.units.vehicle_type vocabulary. */
export const VEHICLE_TYPE_VALUES = ["Tractor", "Straight Truck", "Box Truck", "Pickup", "Passenger Car", "Other"] as const;
export type VehicleType = (typeof VEHICLE_TYPE_VALUES)[number];
/** What counts as a truck. NULL (unclassified) is never a truck. */
export const TRUCK_VEHICLE_TYPES: ReadonlySet<string> = new Set(["Tractor", "Straight Truck", "Box Truck"]);

export function isTruckVehicleType(vehicleType: string | null | undefined): boolean {
  return vehicleType != null && TRUCK_VEHICLE_TYPES.has(vehicleType);
}

/** Case/space-tolerant input -> canonical value, or null when it is not in the vocabulary. */
export function normalizeVehicleType(raw: string | null | undefined): VehicleType | null {
  const t = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return VEHICLE_TYPE_VALUES.find((v) => v.toLowerCase() === t) ?? null;
}

/** Zod field for writers: accepts any casing, stores the canonical value, rejects anything else. */
export const vehicleTypeInputSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizeVehicleType(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `vehicle_type must be one of: ${VEHICLE_TYPE_VALUES.join(", ")}` });
      return z.NEVER;
    }
    return n;
  });

export type FleetTypeFilter = (typeof FLEET_TYPE_FILTER_VALUES)[number];

export const fleetTypeFilterSchema = z.enum(FLEET_TYPE_FILTER_VALUES);

const TRAILER_EQUIPMENT_TYPES = new Set(["Reefer", "DryVan", "Flatbed", "Stepdeck", "Lowboy", "Tanker"]);

export function isTrailerTypeFilter(type: FleetTypeFilter): boolean {
  return type === "Trailer" || TRAILER_EQUIPMENT_TYPES.has(type) || type === "Custom";
}

export function equipmentTypeForFilter(type: FleetTypeFilter): string {
  return type === "Stepdeck" ? "StepDeck" : type;
}

/** SQL fragment excluding all trucks when filtering by trailer equipment type. */
export function truckTypeSqlFilter(type: FleetTypeFilter): string {
  // E-17 addition: a truck is a truck TYPE -- NULL/blank is "Unclassified", never assumed a truck.
  if (type === "Truck") {
    return `vehicle_type IN (${[...TRUCK_VEHICLE_TYPES].map((v) => `'${v}'`).join(", ")})`;
  }
  if (type === "Tractor") {
    return `vehicle_type = 'Tractor'`;
  }
  if (type === "Unclassified") {
    return `(vehicle_type IS NULL OR TRIM(vehicle_type) = '')`;
  }
  if (isTrailerTypeFilter(type)) {
    return "FALSE";
  }
  return "TRUE";
}

/** SQL fragment excluding all trailers when filtering by truck type. */
export function trailerTypeSqlFilter(type: FleetTypeFilter, values: unknown[]): string {
  if (type === "Truck" || type === "Tractor" || type === "Unclassified") {
    return "FALSE";
  }
  if (type === "Trailer") {
    return "TRUE";
  }
  if (type === "Custom") {
    return `(equipment_type IN ('Other', 'Conestoga', 'RGN', 'Container', 'Chassis')
      OR equipment_type IS NULL
      OR equipment_type NOT IN ('DryVan', 'Reefer', 'Flatbed', 'Tanker', 'StepDeck', 'Lowboy'))`;
  }
  values.push(equipmentTypeForFilter(type));
  return `equipment_type = $${values.length}`;
}
