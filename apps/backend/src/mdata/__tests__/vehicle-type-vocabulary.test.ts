import { describe, expect, it } from "vitest";
import { isTruckVehicleType, normalizeVehicleType, trailerTypeSqlFilter, truckTypeSqlFilter, vehicleTypeInputSchema } from "../fleet-type-filter.js";

describe("E-17 addition: vehicle_type vocabulary -- NULL is unclassified, never a truck", () => {
  it("only truck types count as trucks", () => {
    expect(isTruckVehicleType("Tractor")).toBe(true);
    expect(isTruckVehicleType("Straight Truck")).toBe(true);
    expect(isTruckVehicleType("Pickup")).toBe(false);
    expect(isTruckVehicleType("Passenger Car")).toBe(false);
    expect(isTruckVehicleType(null)).toBe(false);
  });
  it("normalizes casing/spacing, refuses anything outside the vocabulary", () => {
    expect(normalizeVehicleType("  tractor ")).toBe("Tractor");
    expect(normalizeVehicleType("box   truck")).toBe("Box Truck");
    expect(normalizeVehicleType("Sleeper")).toBeNull();
    expect(vehicleTypeInputSchema.safeParse("pickup").data).toBe("Pickup");
    expect(vehicleTypeInputSchema.safeParse("Sleeper").success).toBe(false);
  });
  it("Truck filter no longer folds NULL into trucks; Unclassified shows them", () => {
    expect(truckTypeSqlFilter("Truck")).toBe("vehicle_type IN ('Tractor', 'Straight Truck', 'Box Truck')");
    expect(truckTypeSqlFilter("Truck")).not.toMatch(/IS NULL/);
    expect(truckTypeSqlFilter("Unclassified")).toMatch(/vehicle_type IS NULL/);
    expect(trailerTypeSqlFilter("Unclassified", [])).toBe("FALSE");
  });
});
