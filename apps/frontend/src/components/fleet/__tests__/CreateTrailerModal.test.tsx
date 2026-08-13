import { describe, expect, it } from "vitest";
import { equipmentTypesForPickerKind } from "../CreateTrailerModal";

describe("equipmentTypesForPickerKind", () => {
  it("keeps the standalone fleet creator capable of creating every equipment subtype", () => {
    expect(equipmentTypesForPickerKind()).toContain("Chassis");
    expect(equipmentTypesForPickerKind()).toContain("DryVan");
  });

  it("keeps a trailer picker's nested creator inside its reloadable roster", () => {
    expect(equipmentTypesForPickerKind("trailer")).not.toContain("Chassis");
    expect(equipmentTypesForPickerKind("trailer")).toContain("DryVan");
  });

  it("keeps an explicit chassis picker's nested creator chassis-only", () => {
    expect(equipmentTypesForPickerKind("chassis")).toEqual(["Chassis"]);
  });
});
