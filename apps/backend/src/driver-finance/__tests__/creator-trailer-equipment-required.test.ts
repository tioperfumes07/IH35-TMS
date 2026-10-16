import { describe, expect, it, vi } from "vitest";
import { creatorLoadTrailerEquipmentId } from "../creator-trailer-choice.js";

describe("G2 Creator trailer equipment must resolve before booking", () => {
  const companyId = "00000000-0000-4000-8000-000000000001";
  const equipment_id = "00000000-0000-4000-8000-000000000002";
  it.each([null, "", "Unknown", undefined])("refuses unresolved fleet type %s", async (equipment_type) => {
    const query = vi.fn().mockResolvedValue({ rows: equipment_type === undefined ? [] : [{ equipment_type }] });
    await expect(creatorLoadTrailerEquipmentId({ query }, companyId, { kind: "company", equipment_id }))
      .rejects.toMatchObject({ code: "trailer_equipment_type_required" });
    expect(query).toHaveBeenCalledTimes(1);
  });
  it.each(["Reefer", "DryVan", "Flatbed"])("refuses missing active catalog mapping for %s", async (equipment_type) => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ equipment_type }] }).mockResolvedValueOnce({ rows: [] });
    await expect(creatorLoadTrailerEquipmentId({ query }, companyId, { kind: "company", equipment_id }))
      .rejects.toMatchObject({ code: "trailer_equipment_catalog_missing" });
  });
  it.each([["Reefer", "REFRIGERATED_VAN"], ["DryVan", "DRY_VAN"], ["Flatbed", "FLATBED"], ["Lowboy", "LOWBOY"]])("resolves %s without a default", async (equipment_type, code) => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ equipment_type }] }).mockResolvedValueOnce({ rows: [{ id: "catalog-id" }] });
    expect(await creatorLoadTrailerEquipmentId({ query }, companyId, { kind: "company", equipment_id })).toBe("catalog-id");
    expect(query.mock.calls[0][1]).toEqual([equipment_id, companyId]);
    expect(query.mock.calls[1][1]).toEqual([companyId, code]);
  });
  it.each(["none", "customer"] as const)("refuses missing %s catalog mapping", async (kind) => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(creatorLoadTrailerEquipmentId({ query }, companyId, kind === "none" ? { kind } : { kind, trailer_number: "CUSTOMER" }))
      .rejects.toMatchObject({ code: "trailer_equipment_catalog_missing" });
  });
  it("does not look up equipment when no load is being seeded", async () => {
    const query = vi.fn();
    expect(await creatorLoadTrailerEquipmentId({ query }, companyId, null)).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
  it("propagates database failures", async () => {
    const query = vi.fn().mockRejectedValue(new Error("connection failed"));
    await expect(creatorLoadTrailerEquipmentId({ query }, companyId, { kind: "none" })).rejects.toThrow("connection failed");
  });
});
