#!/usr/bin/env node
/**
 * verify-inventory-purchases-honesty.mjs
 *
 * 0441-mod13-inventory-purchases-not-built (superseded 2026-08-15 by
 * INV-PURCHASE-LEDGER-SOR-STOCK-UPSERT, owner-approved) — Purchase History must not twin Parts &
 * Stock, and must be backed by the real append-only maintenance.parts_purchases SoR (not a stock
 * projection, not a hand-rolled fake list).
 *
 * Self-test: node scripts/verify-inventory-purchases-honesty.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/inventory/InventoryPurchasesPage.tsx");
const LABEL = "verify-inventory-purchases-honesty";

/**
 * @param {string} source
 * @returns {string[]}
 */
export function computeFailures(source) {
  const errors = [];
  if (/\blistPartsInventory\b/.test(source) || /from ["'][^"']*PartsInventoryTable["']/.test(source)) {
    errors.push("InventoryPurchasesPage must not import/call stock list APIs (stock twin)");
  }
  if (/<PartsInventoryTable\b/.test(source)) {
    errors.push("InventoryPurchasesPage must not render PartsInventoryTable (stock twin)");
  }
  if (!/listPartsPurchases/.test(source)) {
    errors.push("InventoryPurchasesPage must load the real purchase-event SoR via listPartsPurchases (maintenance.parts_purchases)");
  }
  if (!/<ParityTable\b/.test(source)) {
    errors.push("InventoryPurchasesPage must render the real purchase list via ParityTable");
  }
  if (!/emptyText=/.test(source)) {
    errors.push("InventoryPurchasesPage must expose an honest empty state (ParityTable emptyText) for the zero-purchases case");
  }
  if (!/InventoryPurchasesPage/.test(source)) {
    errors.push("InventoryPurchasesPage export must remain (never delete the door)");
  }
  return errors;
}

function selftest() {
  const good = `
    import { listPartsPurchases } from "../../api/maintenance";
    export function InventoryPurchasesPage() {
      return <ParityTable rows={rows} emptyText="No purchases recorded yet." />;
    }
  `;
  const bad = `
    import { listPartsInventory } from "x";
    import { PartsInventoryTable } from "y";
    export function InventoryPurchasesPage() { return <PartsInventoryTable />; }
  `;
  const cases = [
    { name: "real SoR list", input: good, expectPass: true },
    { name: "stock twin", input: bad, expectPass: false },
  ];
  let ok = true;
  for (const c of cases) {
    const failures = computeFailures(c.input);
    const passed = failures.length === 0;
    if (passed !== c.expectPass) {
      ok = false;
      console.error(`SELFTEST FAIL — ${c.name}: failures=${JSON.stringify(failures)}`);
    } else {
      console.log(`selftest ok — ${c.name}`);
    }
  }
  if (!ok) process.exit(1);
  console.log(`${LABEL} --selftest OK`);
}

function run() {
  const source = fs.readFileSync(PAGE, "utf8");
  const failures = computeFailures(source);
  if (failures.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — Purchase History uses the real append-only SoR (no stock twin)`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
