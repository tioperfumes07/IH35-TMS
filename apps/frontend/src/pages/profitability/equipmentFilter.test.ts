import { describe, expect, it } from "vitest";
import { matchesEquipmentType } from "./equipmentFilter";

describe("matchesEquipmentType", () => {
  it("passes through when filter unset", () => {
    expect(matchesEquipmentType(undefined, "DRY")).toBe(true);
  });
  it("matches DRY aliases for dry_van", () => {
    expect(matchesEquipmentType("dry_van", "DRY")).toBe(true);
    expect(matchesEquipmentType("dry_van", "dry_van")).toBe(true);
  });
  it("matches REFRIGERATED for reefer", () => {
    expect(matchesEquipmentType("reefer", "REFRIGERATED")).toBe(true);
    expect(matchesEquipmentType("reefer", "reefer_van")).toBe(true);
  });
  it("rejects non-matching codes", () => {
    expect(matchesEquipmentType("flatbed", "DRY")).toBe(false);
  });
  it("does not cross-match dry_van against reefer_van / refrigerated_van", () => {
    expect(matchesEquipmentType("dry_van", "reefer_van")).toBe(false);
    expect(matchesEquipmentType("dry_van", "refrigerated_van")).toBe(false);
    expect(matchesEquipmentType("dry_van", "REFRIGERATED")).toBe(false);
  });
  it("does not cross-match reefer against dry van tokens", () => {
    expect(matchesEquipmentType("reefer", "DRY")).toBe(false);
    expect(matchesEquipmentType("reefer", "dry_van")).toBe(false);
  });
});
