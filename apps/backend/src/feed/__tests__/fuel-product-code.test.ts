import { describe, expect, it } from "vitest";
import { fuelTypeFromProductCode, providerReferenceOrNull } from "../seed-settlement-document.service.js";

describe("ROUND 393.2 — fuel_type from the feed's product code, never inferred", () => {
  it("maps the product code", () => {
    expect(fuelTypeFromProductCode("Fuel-Reefer-Diesel")).toBe("reefer_diesel");
    expect(fuelTypeFromProductCode("Reefer")).toBe("reefer_diesel");
    expect(fuelTypeFromProductCode("Fuel-DEF-Diesel Exhaust Fluid")).toBe("def");
    expect(fuelTypeFromProductCode("DEF")).toBe("def");
    expect(fuelTypeFromProductCode("Fuel-Truck Diesel")).toBe("diesel");
    expect(fuelTypeFromProductCode(null)).toBe("diesel");
  });
});

describe("ROUND 393.2 — a provider reference must look like one", () => {
  it("rejects the wrapped-product overflow and free text", () => {
    expect(providerReferenceOrNull("ustFluid")).toBeNull();
    expect(providerReferenceOrNull("Exhaust Fluid")).toBeNull();
    expect(providerReferenceOrNull("")).toBeNull();
  });
  it("keeps real references", () => {
    expect(providerReferenceOrNull("99530579")).toBe("99530579");
    expect(providerReferenceOrNull("7308-2546-4541")).toBe("7308-2546-4541");
  });
});
