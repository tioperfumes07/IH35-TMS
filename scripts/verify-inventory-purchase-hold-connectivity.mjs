#!/usr/bin/env node
/** @matrix-built {"modules":["inventory"],"cols":["connectivity"],"leafRe":"^(nav\\.purchases_tab|purchases\\.honest_empty)$","task":"VERTICAL-CONNECTIVITY-INVENTORY-PURCHASE-LEDGER"} */
/**
 * verify-inventory-purchase-hold-connectivity — INV-PURCHASE-LEDGER-SOR-STOCK-UPSERT (owner-
 * approved 2026-08-15). Supersedes the prior HOLD-lock version of this guard, which required the
 * page to STAY on its honest-empty placeholder forever; that HOLD is closed and the real
 * append-only SoR (maintenance.parts_purchases) has shipped. This guard now asserts the BUILT
 * state: the purchases door + route stay mounted, the page loads the real SoR (never a stock
 * twin), and the migration + HOLD doc both record the shipped decision.
 */
import fs from "node:fs";

const page = fs.readFileSync("apps/frontend/src/pages/inventory/InventoryPurchasesPage.tsx", "utf8");
const tabs = fs.readFileSync("apps/frontend/src/pages/inventory/InventoryModuleTabs.tsx", "utf8");
const manifest = fs.readFileSync("apps/frontend/src/routes/manifest.tsx", "utf8");
const hold = fs.readFileSync("docs/blocks/HOLD-INVENTORY-PURCHASE-HISTORY-SOR.md", "utf8");
const matrix = fs.readFileSync("docs/specs/scoreboard/modules/inventory.required.json", "utf8");
const MIGRATION = "db/migrations/202612560000_inv_purchase_ledger_sor_stock_upsert.sql";

function failures(pageSource = page) {
  return [
    ["purchase tab door", tabs.includes('to: "/inventory/purchases"')],
    ["mounted route", manifest.includes('path="/inventory/purchases"')],
    ["real SoR list", pageSource.includes("listPartsPurchases") && pageSource.includes("<ParityTable")],
    ["no stock twin", !pageSource.includes("listPartsInventory") && !pageSource.includes("<PartsInventoryTable")],
    ["owner approval recorded", hold.includes("OWNER-APPROVED 2026-08-15")],
    ["migration present", fs.existsSync(MIGRATION)],
    ["exact required pair", matrix.includes('"id": "nav.purchases_tab"') && matrix.includes('"id": "purchases.honest_empty"')],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}
if (process.argv.includes("--selftest")) {
  const plantedTwin = page.replace("listPartsPurchases", "listPartsInventory");
  if (!failures(plantedTwin).includes("no stock twin") && !failures(plantedTwin).includes("real SoR list")) {
    console.error("verify-inventory-purchase-hold-connectivity selftest FAIL — stock-twin mutation not caught");
    process.exit(1);
  }
  const plantedNoList = page.replace("<ParityTable", "<div");
  if (!failures(plantedNoList).includes("real SoR list")) {
    console.error("verify-inventory-purchase-hold-connectivity selftest FAIL — missing-ParityTable mutation not caught");
    process.exit(1);
  }
  console.log("verify-inventory-purchase-hold-connectivity selftest PASS — regressions caught");
  process.exit(0);
}
const missing = failures();
if (missing.length) {
  console.error(`verify-inventory-purchase-hold-connectivity FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-inventory-purchase-hold-connectivity PASS — mounted door + real append-only SoR, no stock twin");
