import { describe, expect, it } from "vitest";
import assignments from "./InventoryAssignmentsPage.tsx?raw";
import purchases from "./InventoryPurchasesPage.tsx?raw";

describe("InventoryAssignmentsPage honesty (audit 08-INVENTORY)", () => {
  it("no longer mirrors Purchase History (stock list import + table)", () => {
    expect(assignments).not.toMatch(/from ["'].*PartsInventoryTable["']/);
    expect(assignments).not.toMatch(/import \{[^}]*listPartsInventory[^}]*\}/);
    // Purchases must stay honest — no stock twin (0441-mod13)
    expect(purchases).not.toMatch(/listPartsInventory/);
    expect(purchases).not.toMatch(/PartsInventoryTable/);
    expect(purchases).toMatch(/listPartsPurchases/);
  });

  it("loads the real assignment trail API (parts-invoice-links SoR)", () => {
    expect(assignments).toMatch(/getPartsAssignmentsPage/);
    expect(assignments).toMatch(/parts-assignments/);
  });

  it("cross-links to Purchase History without removing that route", () => {
    expect(assignments).toMatch(/\/inventory\/purchases/);
    expect(purchases).toMatch(/InventoryPurchasesPage|Purchase History/);
  });

  it("exposes WO / unit EntityLinks for forward drill-through", () => {
    expect(assignments).toMatch(/kind="work_order"/);
    expect(assignments).toMatch(/kind="unit"/);
  });
});
