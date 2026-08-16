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
  if (!/filterBar=\{\s*<CollapsedListFilters/.test(source)) {
    errors.push("Purchase History must mount governed Filters inside the canonical ParityTable toolbar");
  }
  for (const action of ["apply", "reset", "cancel"]) {
    if (!new RegExp(`on${action[0].toUpperCase()}${action.slice(1)}=\\{stagedFilters\\.${action}\\}`).test(source)) {
      errors.push(`Purchase History filters must wire explicit ${action} behavior`);
    }
  }
  if (!/rows=\{visibleRows\}/.test(source)) {
    errors.push("Purchase History ParityTable must render the applied-filter result");
  }
  if (!/row\.vendor_id === vendorFilter/.test(source)) {
    errors.push("Purchase History vendor filter must compare the canonical vendor FK");
  }
  if (!/statusFilter === "active"[\s\S]*!row\.voided_at[\s\S]*statusFilter === "voided"[\s\S]*Boolean\(row\.voided_at\)/.test(source)) {
    errors.push("Purchase History status filter must distinguish active and voided receipt events");
  }
  if (!/workOrderLinkedOnly[\s\S]*Boolean\(row\.work_order_id\)/.test(source)) {
    errors.push("Purchase History linked-only filter must use the canonical work-order FK");
  }
  return errors;
}

function selftest() {
  const good = `
    import { listPartsPurchases } from "../../api/maintenance";
    export function InventoryPurchasesPage() {
      if (vendorFilter) next = next.filter((row) => row.vendor_id === vendorFilter);
      if (statusFilter === "active") next = next.filter((row) => !row.voided_at);
      if (statusFilter === "voided") next = next.filter((row) => Boolean(row.voided_at));
      if (workOrderLinkedOnly) next = next.filter((row) => Boolean(row.work_order_id));
      return <ParityTable rows={visibleRows} emptyText="No purchases recorded yet."
        filterBar={<CollapsedListFilters onApply={stagedFilters.apply} onReset={stagedFilters.reset}
          onCancel={stagedFilters.cancel}>filters</CollapsedListFilters>} />;
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
  const mutations = [
    ["filters detached from toolbar", /filterBar=/, "detachedFilterBar="],
    ["Apply is inert", /onApply=\{stagedFilters\.apply\}/, "onApply={() => {}}"],
    ["table ignores applied rows", /rows=\{visibleRows\}/, "rows={rows}"],
    ["vendor predicate no longer uses FK", /row\.vendor_id === vendorFilter/, "row.vendor_name === vendorFilter"],
    ["status predicate loses void truth", /Boolean\(row\.voided_at\)/, "Boolean(row.vendor_id)"],
    ["work-order predicate loses FK", /Boolean\(row\.work_order_id\)/, "Boolean(row.vendor_id)"],
  ];
  for (const [name, pattern, replacement] of mutations) {
    const mutated = good.replace(pattern, replacement);
    if (mutated === good || computeFailures(mutated).length === 0) {
      console.error(`SELFTEST FAIL — mutation survived: ${name}`);
      process.exit(1);
    }
    console.log(`selftest ok — mutation rejected: ${name}`);
  }
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
