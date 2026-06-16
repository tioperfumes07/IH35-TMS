import { describe, it, expect } from "vitest";
import { mapSamsaraTrailerType, isExcludedCompanyVehicle } from "./samsara-master-sync.service.js";

describe("mapSamsaraTrailerType", () => {
  it("maps reefer + the recurring REFEER misspelling to Reefer", () => {
    expect(mapSamsaraTrailerType({ model: "REEFER" })).toBe("Reefer");
    expect(mapSamsaraTrailerType({ model: "REFEER" })).toBe("Reefer");
    expect(mapSamsaraTrailerType({ name: "53' Reefer" })).toBe("Reefer");
  });

  it("maps flatbed and lowboy", () => {
    expect(mapSamsaraTrailerType({ model: "FLATBED" })).toBe("Flatbed");
    expect(mapSamsaraTrailerType({ model: "LOWBOY" })).toBe("Lowboy");
    expect(mapSamsaraTrailerType({ name: "53' Flatbed" })).toBe("Flatbed");
  });

  it("maps 53' Van to DryVan and defaults unknown to DryVan", () => {
    expect(mapSamsaraTrailerType({ name: "53' Van" })).toBe("DryVan");
    expect(mapSamsaraTrailerType({})).toBe("DryVan");
  });

  it("returns a value within the mdata.equipment CHECK enum", () => {
    const valid = ["DryVan", "Reefer", "Flatbed", "Tanker", "Container", "Chassis", "StepDeck", "Lowboy"];
    expect(valid).toContain(mapSamsaraTrailerType({ model: "REEFER" }));
    expect(valid).toContain(mapSamsaraTrailerType({}));
  });
});

describe("isExcludedCompanyVehicle (scope lock — trailers only)", () => {
  it("excludes the known company cars/pickups by make/model", () => {
    expect(isExcludedCompanyVehicle("Nissan", "Versa")).toBe(true);
    expect(isExcludedCompanyVehicle("Honda", "Element")).toBe(true);
    expect(isExcludedCompanyVehicle("Kia", "Rio")).toBe(true);
    expect(isExcludedCompanyVehicle("KIA", "Soul")).toBe(true);
    expect(isExcludedCompanyVehicle("Ford", "Ranger")).toBe(true);
    expect(isExcludedCompanyVehicle("Chevrolet", "Silverado")).toBe(true);
  });

  it("excludes a Versa even when Samsara mislabels its type (caught by make/model, not type)", () => {
    // "Versa WHIT" is tagged 53' Flatbed in Samsara but is still a car.
    expect(isExcludedCompanyVehicle("Nissan", "Versa")).toBe(true);
  });

  it("keeps real trailers (UTILITY / WABASH)", () => {
    expect(isExcludedCompanyVehicle("UTILITY", "REEFER")).toBe(false);
    expect(isExcludedCompanyVehicle("WABASH", "REEFER")).toBe(false);
    expect(isExcludedCompanyVehicle("UTILITY", "FLATBED")).toBe(false);
    expect(isExcludedCompanyVehicle(null, null)).toBe(false);
  });
});
