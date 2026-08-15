import { describe, expect, it } from "vitest";
import type { MaintenancePartRow } from "../../api/maintenance";
import partsStockPage from "./InventoryPartsStockPage.tsx?raw";
import { mapMaintenancePartsToInventoryRows } from "./InventoryPartsStockPage";

// B1: the inventory Parts & Stock page reads /api/v1/maintenance/parts (the real backend) and maps
// its row shape onto the page's columns. This locks the field mapping + status derivation.

const base: MaintenancePartRow = {
  id: "p1",
  part_number: "BRK-100",
  name: "Brake pad",
  category: "Brakes",
  notes: "OEM only",
  vendor_id: "v-11111111-1111-1111-1111-111111111111",
  vendor_name: "Acme Parts",
  vendor_default: null,
  unit_cost: 42.5,
  qty_on_hand: 7,
  reorder_threshold: 4,
  location: "A-12",
  source: "manual",
  voided_at: null,
  voided_reason: null,
};

describe("InventoryPartsStockPage read path", () => {
  it("loads parts via listMaintenanceParts (apiRequest), not raw fetch(resolveApiUrl)", () => {
    expect(partsStockPage).not.toMatch(/fetch\s*\(\s*resolveApiUrl/);
    expect(partsStockPage).toMatch(/listMaintenanceParts/);
  });

  it("does not enrich vendor labels from a capped listVendors roster", () => {
    expect(partsStockPage).not.toMatch(/listVendors/);
    expect(partsStockPage).not.toMatch(/CappedListNotice/);
  });
});

describe("mapMaintenancePartsToInventoryRows", () => {
  it("maps maintenance fields onto the inventory row shape", () => {
    const [row] = mapMaintenancePartsToInventoryRows([base]);
    expect(row).toEqual({
      id: "p1",
      name: "Brake pad",
      sku: "BRK-100", // part_number -> sku
      category: "Brakes", // INV-1: persisted category round-trips
      notes: "OEM only", // INV-1: persisted notes round-trips
      on_hand_qty: 7, // qty_on_hand -> on_hand_qty
      reorder_threshold: 4,
      unit_cost: 42.5,
      location: "A-12",
      vendor_id: "v-11111111-1111-1111-1111-111111111111",
      vendor_label: "Acme Parts",
      status: "In stock",
      voided_at: null,
    });
  });

  it("INV-LINK-01: maps vendor_id and vendor_label from API vendor_name join", () => {
    const [row] = mapMaintenancePartsToInventoryRows([base]);
    expect(row.vendor_id).toBe("v-11111111-1111-1111-1111-111111111111");
    expect(row.vendor_label).toBe("Acme Parts");
  });

  it("INV-LINK-01: null vendor_id yields null vendor_label", () => {
    const [row] = mapMaintenancePartsToInventoryRows([{ ...base, vendor_id: null, vendor_name: null }]);
    expect(row.vendor_id).toBeNull();
    expect(row.vendor_label).toBeNull();
  });

  it("INV-1: null category/notes tolerate to null (no crash, real SKU still maps)", () => {
    const [row] = mapMaintenancePartsToInventoryRows([{ ...base, category: null, notes: null }]);
    expect(row.category).toBeNull();
    expect(row.notes).toBeNull();
    expect(row.sku).toBe("BRK-100");
  });

  it("derives 'Out of stock' at zero qty and 'Voided' when voided_at is set", () => {
    expect(mapMaintenancePartsToInventoryRows([{ ...base, qty_on_hand: 0 }])[0].status).toBe("Out of stock");
    expect(mapMaintenancePartsToInventoryRows([{ ...base, voided_at: "2026-06-13T00:00:00Z" }])[0].status).toBe("Voided");
  });

  it("defaults missing reorder_threshold to 0", () => {
    const [row] = mapMaintenancePartsToInventoryRows([
      { ...base, reorder_threshold: undefined } as unknown as MaintenancePartRow,
    ]);
    expect(row.reorder_threshold).toBe(0);
  });

  it("treats null qty as 0 and tolerates an empty list", () => {
    expect(
      mapMaintenancePartsToInventoryRows([{ ...base, qty_on_hand: null } as unknown as MaintenancePartRow])[0]
        .on_hand_qty,
    ).toBe(0);
    expect(mapMaintenancePartsToInventoryRows([])).toEqual([]);
  });
});
