import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const assignmentsPath = path.join(here, "InventoryAssignmentsPage.tsx");
const purchasesPath = path.join(here, "InventoryPurchasesPage.tsx");

describe("InventoryAssignmentsPage honesty (audit 08-INVENTORY)", () => {
  const assignments = fs.readFileSync(assignmentsPath, "utf8");
  const purchases = fs.readFileSync(purchasesPath, "utf8");

  it("no longer mirrors Purchase History (stock list import + table)", () => {
    expect(assignments).not.toMatch(/from ["'].*PartsInventoryTable["']/);
    expect(assignments).not.toMatch(/import \{[^}]*listPartsInventory[^}]*\}/);
    // Purchases page may still use stock list — keep that door; do not delete it
    expect(purchases).toMatch(/listPartsInventory/);
    expect(purchases).toMatch(/PartsInventoryTable/);
  });

  it("loads the real assignment trail API (parts-invoice-links SoR)", () => {
    expect(assignments).toMatch(/listPartsAssignments/);
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
