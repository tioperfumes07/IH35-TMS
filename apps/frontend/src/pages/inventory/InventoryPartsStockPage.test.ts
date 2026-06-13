import { describe, expect, it } from "vitest";
import { mapMaintenancePartsToInventoryRows, type MaintenancePartRow } from "./InventoryPartsStockPage";

// B1: the inventory Parts & Stock page reads /api/v1/maintenance/parts (the real backend) and maps
// its row shape onto the page's columns. This locks the field mapping + status derivation.

const base: MaintenancePartRow = {
  id: "p1",
  part_number: "BRK-100",
  name: "Brake pad",
  unit_cost: 42.5,
  qty_on_hand: 7,
  location: "A-12",
  voided_at: null,
};

describe("mapMaintenancePartsToInventoryRows", () => {
  it("maps maintenance fields onto the inventory row shape", () => {
    const [row] = mapMaintenancePartsToInventoryRows([base]);
    expect(row).toEqual({
      id: "p1",
      name: "Brake pad",
      sku: "BRK-100", // part_number -> sku
      on_hand_qty: 7, // qty_on_hand -> on_hand_qty
      unit_cost: 42.5,
      location: "A-12",
      status: "In stock",
    });
  });

  it("derives 'Out of stock' at zero qty and 'Voided' when voided_at is set", () => {
    expect(mapMaintenancePartsToInventoryRows([{ ...base, qty_on_hand: 0 }])[0].status).toBe("Out of stock");
    expect(mapMaintenancePartsToInventoryRows([{ ...base, voided_at: "2026-06-13T00:00:00Z" }])[0].status).toBe("Voided");
  });

  it("treats null qty as 0 and tolerates an empty list", () => {
    expect(mapMaintenancePartsToInventoryRows([{ ...base, qty_on_hand: null }])[0].on_hand_qty).toBe(0);
    expect(mapMaintenancePartsToInventoryRows([])).toEqual([]);
  });
});
