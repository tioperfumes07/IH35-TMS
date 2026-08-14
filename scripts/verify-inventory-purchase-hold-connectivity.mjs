#!/usr/bin/env node
/** @matrix-built {"modules":["inventory"],"cols":["connectivity"],"leafRe":"^(nav\.purchases_tab|purchases\.honest_empty)$","task":"VERTICAL-CONNECTIVITY-INVENTORY-PURCHASE-HOLD"} */
import fs from "node:fs";

const page = fs.readFileSync("apps/frontend/src/pages/inventory/InventoryPurchasesPage.tsx", "utf8");
const tabs = fs.readFileSync("apps/frontend/src/pages/inventory/InventoryModuleTabs.tsx", "utf8");
const manifest = fs.readFileSync("apps/frontend/src/routes/manifest.tsx", "utf8");
const hold = fs.readFileSync("docs/blocks/HOLD-INVENTORY-PURCHASE-HISTORY-SOR.md", "utf8");
const matrix = fs.readFileSync("docs/specs/scoreboard/modules/inventory.required.json", "utf8");

function failures(pageSource = page) {
  return [
    ["purchase tab door", tabs.includes('to: "/inventory/purchases"')],
    ["mounted route", manifest.includes('path="/inventory/purchases"')],
    ["honest state", pageSource.includes('data-testid="inventory-purchases-honest-empty"') && pageSource.includes("not yet tracked")],
    ["no stock twin", !pageSource.includes("listPartsInventory") && !pageSource.includes("PartsInventoryTable")],
    ["owner hold retained", hold.includes("[HOLD-FOR-JORGE]") && hold.includes("No migration. No fake ledger")],
    ["Neon answer recorded", hold.includes("no alternate append-only purchase SoR exists")],
    ["exact required pair", matrix.includes('"id": "nav.purchases_tab"') && matrix.includes('"id": "purchases.honest_empty"')],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}
if (process.argv.includes("--selftest")) {
  const planted = page.replace('data-testid="inventory-purchases-honest-empty"', 'data-testid="inventory-purchases-stock-twin"');
  if (!failures(planted).includes("honest state")) process.exit(1);
  console.log("verify-inventory-purchase-hold-connectivity selftest PASS — honesty mutation red");
  process.exit(0);
}
const missing = failures();
if (missing.length) {
  console.error(`verify-inventory-purchase-hold-connectivity FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-inventory-purchase-hold-connectivity PASS — mounted door + honest HOLD, no fake ledger");
