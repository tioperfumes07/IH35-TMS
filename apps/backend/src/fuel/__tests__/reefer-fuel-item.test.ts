import { describe, expect, it } from "vitest";
import { isReeferFuelItemName } from "../reefer-fuel.service.js";

describe("U25 reefer fuel item detection — the credit counts reefer FUEL only", () => {
  it("recognizes the reefer fuel items", () => {
    expect(isReeferFuelItemName("Fuel-Reefer-Diesel")).toBe(true);
    expect(isReeferFuelItemName("Relay Reefer Fuel (per gallon)")).toBe(true);
  });
  it("leaves out truck diesel, DEF and reefer services", () => {
    expect(isReeferFuelItemName("Fuel-Truck Diesel")).toBe(false);
    expect(isReeferFuelItemName("Fuel-DEF-Diesel Exhaust Fluid")).toBe(false);
    expect(isReeferFuelItemName("Reefer-Trailer Washout Expense")).toBe(false);
    expect(isReeferFuelItemName("Reefer Repair")).toBe(false);
  });
});
