import { describe, expect, it, vi } from "vitest";
import { assetTypeForEquipmentType, ensureEquipmentAsset } from "./ensure-equipment-asset.shared.js";

describe("equipment insurance asset bridge", () => {
  it.each([
    ["DryVan", "dry_van"],
    ["Reefer", "reefer"],
    ["Flatbed", "flatbed"],
    ["StepDeck", "flatbed"],
    ["Lowboy", "flatbed"],
    ["Conestoga", "flatbed"],
    ["RGN", "flatbed"],
    ["Tanker", "other"],
    ["Container", "other"],
    ["Chassis", "other"],
    ["Other", "other"],
  ])("maps %s to the canonical asset subtype %s", (equipmentType, assetType) => {
    expect(assetTypeForEquipmentType(equipmentType)).toBe(assetType);
  });

  it("writes the mapped subtype and preserves the equipment identity", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "asset-1", equipment_id: "equipment-1" }] });

    await expect(
      ensureEquipmentAsset(
        { query },
        {
          tenantId: "company-1",
          equipmentId: "equipment-1",
          equipmentNumber: "TR-101",
          equipmentType: "Reefer",
          vin: "VIN-1",
          make: "Utility",
          model: null,
          year: 2024,
        },
      ),
    ).resolves.toBe("asset-1");

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[1]).toEqual([
      "company-1",
      "TR-101",
      "reefer",
      "VIN-1",
      "Utility",
      null,
      2024,
      "equipment-1",
    ]);
  });
});
