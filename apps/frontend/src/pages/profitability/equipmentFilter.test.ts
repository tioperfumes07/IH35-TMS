import { describe, expect, it } from "vitest";
import { matchesEquipmentType } from "./equipmentFilter";

describe("matchesEquipmentType", () => {
  it("passes through when filter unset", () => {
    expect(matchesEquipmentType(undefined, "DRY")).toBe(true);
  });
  it("matches DRY aliases for dry_van", () => {
    expect(matchesEquipmentType("dry_van", "DRY")).toBe(true);
    expect(matchesEquipmentType("dry_van", "Dry Van")).toBe(true);
  });
  it("matches REFRIGERATED for reefer", () => {
    expect(matchesEquipmentType("reefer", "REFRIGERATED")).toBe(true);
  });
  it("rejects non-matching codes", () => {
    expect(matchesEquipmentType("flatbed", "DRY")).toBe(false);
  });
});
