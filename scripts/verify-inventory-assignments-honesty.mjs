#!/usr/bin/env node
/**
 * verify-inventory-assignments-honesty.mjs
 *
 * Audit 08-INVENTORY: Assignments must NOT be a twin of Purchase History (stock list).
 * SoR for assignments = maintenance.parts_invoice_links (WO part-consumption trail).
 * Purchases page stays (never delete).
 *
 * Self-test: node scripts/verify-inventory-assignments-honesty.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSIGNMENTS = path.join(ROOT, "apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx");
const PURCHASES = path.join(ROOT, "apps/frontend/src/pages/inventory/InventoryPurchasesPage.tsx");
const LABEL = "verify-inventory-assignments-honesty";

/**
 * @param {{ assignments: string, purchases: string }} files
 * @returns {string[]}
 */
export function computeFailures(files) {
  const assignments = files.assignments ?? "";
  const purchases = files.purchases ?? "";
  const errors = [];

  if (/from ["'].*PartsInventoryTable["']/.test(assignments) || /listPartsInventory/.test(assignments)) {
    errors.push("InventoryAssignmentsPage must not use PartsInventoryTable / listPartsInventory (Purchase History twin)");
  }
  // Purchases door stays; must NOT twin stock (0441-mod13 / HOLD-INVENTORY-PURCHASE-HISTORY-SOR,
  // superseded 2026-08-15 by INV-PURCHASE-LEDGER-SOR-STOCK-UPSERT — real SoR now, still no stock twin).
  if (/\blistPartsInventory\b/.test(purchases) || /<PartsInventoryTable\b/.test(purchases) || /from ["'][^"']*PartsInventoryTable["']/.test(purchases)) {
    errors.push("InventoryPurchasesPage must not twin stock via listPartsInventory / PartsInventoryTable");
  }
  if (!/InventoryPurchasesPage/.test(purchases) || !/Purchase History/.test(purchases)) {
    errors.push("InventoryPurchasesPage door must remain (Purchase History label)");
  }
  if (!/listPartsPurchases/.test(purchases)) {
    errors.push("InventoryPurchasesPage must load the real purchase-event SoR via listPartsPurchases");
  }
  // 2026-08-21 (CC-3): the page was refactored to call the paginated getPartsAssignmentsPage(...)
  // directly instead of the older listPartsAssignments wrapper — same real endpoint/SoR (asserted
  // elsewhere in this file); listPartsAssignments itself still exists in api/maintenance.ts as a
  // thin compat wrapper over getPartsAssignmentsPage. Accept either call shape.
  if (
    (!/listPartsAssignments/.test(assignments) && !/getPartsAssignmentsPage/.test(assignments)) ||
    !/parts-assignments/.test(assignments)
  ) {
    errors.push("InventoryAssignmentsPage must load listPartsAssignments (or getPartsAssignmentsPage) / parts-assignments SoR");
  }
  if (/<code[^>]*>\s*maintenance\.parts_invoice_links\s*<\/code>/.test(assignments)) {
    errors.push("InventoryAssignmentsPage must not expose its internal database table name to operators");
  }
  if (!/\/inventory\/purchases/.test(assignments)) {
    errors.push("InventoryAssignmentsPage must cross-link to /inventory/purchases");
  }
  if (!/kind="work_order"/.test(assignments) || !/kind="unit"/.test(assignments)) {
    errors.push("InventoryAssignmentsPage must EntityLink WO + unit");
  }
  if (!/assignmentsQuery\.isError/.test(assignments) || !/\bListErrorState\b/.test(assignments)) {
    errors.push("InventoryAssignmentsPage must use assignmentsQuery.isError -> ListErrorState (not static error div)");
  }
  return errors;
}

function selftest() {
  const good = {
    assignments: `
      import { listPartsAssignments } from "../../api/...";
      // parts-assignments
      <Link to="/inventory/purchases">Purchase History</Link>
      <EntityLink kind="work_order" id={r.wo_id} />
      <EntityLink kind="unit" id={r.unit_id} />
      assignmentsQuery.isError ? <ListErrorState /> : null
      <p>Parts used on work orders appear in this assignment trail.</p>
    `,
    purchases: `
      import { listPartsPurchases } from "../../api/maintenance";
      export function InventoryPurchasesPage() {
        return <section>Purchase History <ParityTable /></section>;
      }
    `,
  };
  const badTwin = {
    ...good,
    assignments: `import { listPartsInventory } from "x"; import { PartsInventoryTable } from "y";`,
  };
  const badPurchasesTwin = {
    ...good,
    purchases: `import { listPartsInventory } from "x"; <PartsInventoryTable /> export function InventoryPurchasesPage() {}`,
  };
  const cases = [
    { name: "honest assignments", input: good, expectPass: true },
    { name: "assignments twin of purchases", input: badTwin, expectPass: false },
    { name: "purchases stock twin", input: badPurchasesTwin, expectPass: false },
    {
      name: "internal table name leaked in operator copy",
      input: { ...good, assignments: `${good.assignments}<code>maintenance.parts_invoice_links</code>` },
      expectPass: false,
    },
  ];
  let ok = true;
  for (const c of cases) {
    const failures = computeFailures(c.input);
    const passed = failures.length === 0;
    if (passed !== c.expectPass) {
      ok = false;
      console.error(`SELFTEST FAIL — ${c.name}`);
    } else {
      console.log(`selftest ok — ${c.name}`);
    }
  }
  if (!ok) process.exit(1);
  console.log(`${LABEL} --selftest OK`);
}

function run() {
  const failures = computeFailures({
    assignments: fs.readFileSync(ASSIGNMENTS, "utf8"),
    purchases: fs.readFileSync(PURCHASES, "utf8"),
  });
  if (failures.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — Assignments uses parts-assignments SoR; Purchases kept`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
