#!/usr/bin/env node
/**
 * INV-S02 + INV-S03 + INV-PICK-01 — assignments trail, purchases honest empty, canonical parts picker.
 *
 *   node scripts/verify-inv-s02-s03-pick-01.mjs
 *   node scripts/verify-inv-s02-s03-pick-01.mjs --selftest
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const LABEL = "verify-inv-s02-s03-pick-01";
const SELFTEST = process.argv.includes("--selftest");

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

export function verifyInvS02S03Pick(root = ROOT, overrides = {}) {
  const errs = [];
  const source = (rel) => overrides[rel] ?? read(rel);
  const assign = source("apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx");
  const purch = source("apps/frontend/src/pages/inventory/InventoryPurchasesPage.tsx");
  const maintenanceApi = source("apps/frontend/src/api/maintenance.ts");
  const routes = source("apps/backend/src/maintenance/parts-invoice-links.routes.ts");
  const purchaseRoutes = source("apps/backend/src/maintenance/parts-inventory.routes.ts");
  const partsRoutes = source("apps/backend/src/maintenance/parts.routes.ts");
  const stock = source("apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx");
  const create = source("apps/frontend/src/pages/inventory/PartCreateDrawer.tsx");
  const manifest = source("apps/frontend/src/routes/manifest.tsx");

  // INV-S02
  // 2026-08-21 (CC-3): InventoryAssignmentsPage.tsx was refactored to call the paginated
  // getPartsAssignmentsPage(...) directly instead of the older listPartsAssignments wrapper —
  // same real endpoint (/api/v1/maintenance/parts-invoice-links), same real SoR (asserted below);
  // listPartsAssignments itself still exists in api/maintenance.ts as a thin compat wrapper over
  // getPartsAssignmentsPage. Accept either call shape.
  if (!/listPartsAssignments/.test(assign) && !/getPartsAssignmentsPage/.test(assign)) {
    errs.push("Assignments page must call listPartsAssignments (or getPartsAssignmentsPage)");
  }
  if (!/No part assignments yet/.test(assign)) errs.push("Assignments missing honest emptyText");
  if (!/parts_invoice_links/.test(assign) || !/parts_invoice_links/.test(routes)) {
    errs.push("Assignments SoR must be maintenance.parts_invoice_links");
  }
  if (!/WHERE pil\.operating_company_id = \$1/.test(routes)) {
    errs.push("parts-invoice-links list must filter operating_company_id");
  }
  if (!/path="\/inventory\/assignments"/.test(manifest)) errs.push("manifest missing /inventory/assignments");

  // INV-S03
  if (!/listPartsPurchases/.test(purch)) {
    errs.push("Purchases page must call listPartsPurchases");
  }
  // 2026-08-21 (CC-3): copy reworded to point at the real "+ Record Purchase" CTA instead of the
  // vaguer "Parts & Stock" reference — still an honest, non-fabricated empty state.
  if (!/No purchases recorded yet\. Use \+ Record Purchase to add a receipt through Maintenance Parts Inventory\./.test(purch)) {
    errs.push("Purchases page missing honest emptyText");
  }
  if (!/maintenance\.parts_purchases \(append-only\)/.test(purch)) {
    errs.push("Purchases page must name the append-only purchase SoR");
  }
  if (!/\/api\/v1\/maintenance\/parts-inventory\/purchases\?/.test(maintenanceApi)) {
    errs.push("listPartsPurchases must call the canonical purchase-history endpoint");
  }
  if (!/FROM maintenance\.parts_purchases pp/.test(purchaseRoutes)) {
    errs.push("purchase-history route must read maintenance.parts_purchases");
  }
  if (!/WHERE pp\.operating_company_id = \$1::uuid/.test(purchaseRoutes)) {
    errs.push("purchase-history route must filter one operating company");
  }
  if (!/app\.post\("\/api\/v1\/maintenance\/parts-inventory\/purchases\/:id\/void"/.test(purchaseRoutes)) {
    errs.push("purchase history must expose void/reversal instead of delete");
  }
  if (!/path="\/inventory\/purchases"/.test(manifest)) errs.push("manifest missing /inventory/purchases");

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
  const purchPath = "apps/frontend/src/pages/inventory/InventoryPurchasesPage.tsx";
  const apiPath = "apps/frontend/src/api/maintenance.ts";
  const routePath = "apps/backend/src/maintenance/parts-inventory.routes.ts";
  const fixtures = [
    ["missing list reader", purchPath, /listPartsPurchases/g, "listPurchases_REMOVED"],
    ["missing honest empty", purchPath, /No purchases recorded yet\. Use \+ Record Purchase to add a receipt through Maintenance Parts Inventory\./g, "History unavailable"],
    ["wrong SoR copy", purchPath, /maintenance\.parts_purchases \(append-only\)/g, "maintenance.parts_inventory"],
    ["wrong client endpoint", apiPath, /\/api\/v1\/maintenance\/parts-inventory\/purchases\?/g, "/api/v1/maintenance/parts?"],
    ["wrong backend table", routePath, /FROM maintenance\.parts_purchases pp/g, "FROM maintenance.parts_inventory pp"],
    ["missing company predicate", routePath, /WHERE pp\.operating_company_id = \$1::uuid/g, "WHERE TRUE"],
    ["missing void route", routePath, /app\.post\("\/api\/v1\/maintenance\/parts-inventory\/purchases\/:id\/void"/g, 'app.post("/api/v1/maintenance/parts-inventory/purchases/:id/archive"'],
  ];
  for (const [name, path, pattern, replacement] of fixtures) {
    const original = read(path);
    const mutated = original.replace(pattern, replacement);
    if (mutated === original || verifyInvS02S03Pick(ROOT, { [path]: mutated }).length === 0) {
      console.error(`${LABEL} --selftest FAIL: ${name}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest OK — ${fixtures.length}/${fixtures.length} purchase-ledger mutations rejected`);
} else {
  const errs = verifyInvS02S03Pick();
  if (errs.length) {
    console.error(`${LABEL} FAIL`);
    for (const e of errs) console.error(" -", e);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}
