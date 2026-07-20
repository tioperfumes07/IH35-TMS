#!/usr/bin/env node
/**
 * verify-inventory-purchases-honesty.mjs
 *
 * 0441-mod13-inventory-purchases-not-built — Purchase History must not twin Parts & Stock.
 * Until purchase-event SoR ships: honest empty state only (no listPartsInventory / PartsInventoryTable).
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
  if (!/inventory-purchases-honest-empty|not yet tracked/i.test(source)) {
    errors.push("InventoryPurchasesPage must expose an honest empty / not-yet-tracked state");
  }
  if (!/InventoryPurchasesPage/.test(source)) {
    errors.push("InventoryPurchasesPage export must remain (never delete the door)");
  }
  return errors;
}

function selftest() {
  const good = `
    export function InventoryPurchasesPage() {
      return <section data-testid="inventory-purchases-honest-empty">not yet tracked</section>;
    }
  `;
  const bad = `
    import { listPartsInventory } from "x";
    import { PartsInventoryTable } from "y";
    export function InventoryPurchasesPage() { return <PartsInventoryTable />; }
  `;
  const cases = [
    { name: "honest empty", input: good, expectPass: true },
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
  console.log(`[${LABEL}] OK — Purchase History is honest (no stock twin)`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
