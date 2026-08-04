#!/usr/bin/env node
/**
 * INV-S02 + INV-S03 + INV-PICK-01 — assignments trail, purchases honest empty, canonical parts picker.
 *
 *   node scripts/verify-inv-s02-s03-pick-01.mjs
 *   node scripts/verify-inv-s02-s03-pick-01.mjs --selftest
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const LABEL = "verify-inv-s02-s03-pick-01";
const SELFTEST = process.argv.includes("--selftest");

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

export function verifyInvS02S03Pick(root = ROOT) {
  const errs = [];
  const assign = read("apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx");
  const purch = read("apps/frontend/src/pages/inventory/InventoryPurchasesPage.tsx");
  const routes = read("apps/backend/src/maintenance/parts-invoice-links.routes.ts");
  const partsRoutes = read("apps/backend/src/maintenance/parts.routes.ts");
  const stock = read("apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx");
  const create = read("apps/frontend/src/pages/inventory/PartCreateDrawer.tsx");
  const manifest = read("apps/frontend/src/routes/manifest.tsx");

  // INV-S02
  if (!/listPartsAssignments/.test(assign)) errs.push("Assignments page must call listPartsAssignments");
  if (!/No part assignments yet/.test(assign)) errs.push("Assignments missing honest emptyText");
  if (!/parts_invoice_links/.test(assign) || !/parts_invoice_links/.test(routes)) {
    errs.push("Assignments SoR must be maintenance.parts_invoice_links");
  }
  if (!/WHERE pil\.operating_company_id = \$1/.test(routes)) {
    errs.push("parts-invoice-links list must filter operating_company_id");
  }
  if (!/path="\/inventory\/assignments"/.test(manifest)) errs.push("manifest missing /inventory/assignments");

  // INV-S03
  if (!/data-testid="inventory-purchases-honest-empty"/.test(purch)) {
    errs.push("Purchases page missing honest-empty test id");
  }
  if (!/HOLD-INVENTORY-PURCHASE-HISTORY-SOR/.test(purch)) {
    errs.push("Purchases must cite HOLD SoR (no stock twin as history)");
  }
  if (!/path="\/inventory\/purchases"/.test(manifest)) errs.push("manifest missing /inventory/purchases");
  if (!existsSync(join(root, "docs/blocks/HOLD-INVENTORY-PURCHASE-HISTORY-SOR.md"))) {
    errs.push("missing HOLD-INVENTORY-PURCHASE-HISTORY-SOR.md");
  }

  // INV-PICK-01
  if (!/listMaintenanceParts/.test(stock)) errs.push("Parts & Stock must use listMaintenanceParts");
  if (!/FROM maintenance\.parts_inventory/.test(partsRoutes)) {
    errs.push("parts.routes must SELECT FROM maintenance.parts_inventory");
  }
  if (/FROM\s+catalogs\.parts\b/i.test(partsRoutes) || /FROM\s+catalogs\.parts\b/i.test(stock)) {
    errs.push("must not read catalogs.parts for inventory roster");
  }
  if (/catalogs\.parts/.test(create) && !/Do not seed\/read deprecated catalogs\.parts/.test(create)) {
    errs.push("PartCreateDrawer must not use catalogs.parts as live source");
  }
  if (!/PART_INVENTORY_CATEGORIES/.test(create)) {
    errs.push("PartCreateDrawer must use PART_INVENTORY_CATEGORIES taxonomy");
  }

  return errs;
}

if (SELFTEST) {
  const errs = verifyInvS02S03Pick();
  if (errs.length) {
    console.error(`${LABEL} --selftest FAIL:`, errs);
    process.exit(1);
  }
  // Negative: strip emptyText
  const assign = read("apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx");
  if (!/No part assignments yet/.test(assign)) {
    console.error(`${LABEL} --selftest FAIL: fixture expectation`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
} else {
  const errs = verifyInvS02S03Pick();
  if (errs.length) {
    console.error(`${LABEL} FAIL`);
    for (const e of errs) console.error(" -", e);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}
