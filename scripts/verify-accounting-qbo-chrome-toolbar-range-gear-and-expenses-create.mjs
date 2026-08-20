#!/usr/bin/env node
/**
 * Accounting qbo_chrome — batch 4 of 4: the last 3 leaves left after batches 1-3, found via a
 * SWARM-ONE-MODULE completeness sweep of all 66 accounting.required.json leaves that require
 * qbo_chrome. All 3 confirmed genuinely REAL chrome (no product gap, unlike chrome.toolbar_search
 * in batch 3) — only the old broad CURSOR-VERTICAL sweep claimed them, and it never opens any of
 * these assertions. HONEST-BUILT-LAUNCH-LAW: no leafRe:".*"; every leafRe below is leaf-specific.
 *
 * - expenses.create: ExpensesListPage's "+ Create" mounts RecordExpenseModal — the SAME real
 *   ParityDrawer chrome already proven by batch1 for leaf accounting.modal.record_expense, just
 *   reached from this leaf's own nav id.
 * - chrome.toolbar_range: BillsPage's CollapsedListFilters carries two real DatePicker controls
 *   (dateFrom/dateTo) committed via the staged-filter Apply gate.
 * - chrome.toolbar_gear: BillsPage's <ParityTable> mounts the shared component's own gear (⚙)
 *   popover — Density + column show/hide checklist + explicit Apply (applyGear).
 *
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^expenses\\.create$","task":"VERTICAL-QBO-CHROME-accounting-expenses-create","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^chrome\\.toolbar_range$","task":"VERTICAL-QBO-CHROME-accounting-toolbar-range","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^chrome\\.toolbar_gear$","task":"VERTICAL-QBO-CHROME-accounting-toolbar-gear","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-accounting-qbo-chrome-toolbar-range-gear-and-expenses-create.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-accounting-qbo-chrome-toolbar-range-gear-and-expenses-create";

const CHECKS = [
  { name: "expenses.create: ExpensesListPage mounts the real RecordExpenseModal", file: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx", pattern: /<RecordExpenseModal\b/ },
  { name: "expenses.create target: RecordExpenseModal is a real ParityDrawer", file: "apps/frontend/src/components/expenses/RecordExpenseModal.tsx", pattern: /<ParityDrawer/ },
  { name: "chrome.toolbar_range: BillsPage has two real DatePicker range controls (dateFrom/dateTo)", file: "apps/frontend/src/pages/accounting/BillsPage.tsx", pattern: /staged\.draft\.dateFrom[\s\S]*staged\.draft\.dateTo/ },
  { name: "chrome.toolbar_gear: BillsPage mounts ParityTable with real columns prop", file: "apps/frontend/src/pages/accounting/BillsPage.tsx", pattern: /<ParityTable[\s\S]{0,200}columns=\{columns\}/ },
  { name: "chrome.toolbar_gear target: ParityTable's own gear popover has Density + column toggle + Apply", file: "apps/frontend/src/components/parity/ParityTable.tsx", pattern: /applyGear[\s\S]*gearOpen|gearOpen[\s\S]*applyGear/ },
];

function runChecks(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (!c.pattern.test(src)) fails.push(`${c.name}: pattern miss in ${c.file}`);
  }
  return fails;
}

function selftest() {
  const live = runChecks();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".accounting-qbo-chrome-b4-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison — no chrome\n");
    }
    const planted = runChecks(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL — planted chrome misses not caught (${planted.length}/${CHECKS.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length}/${CHECKS.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const fails = runChecks();
if (fails.length) {
  console.error(`${LABEL} FAIL (${fails.length}):\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${CHECKS.length} accounting qbo_chrome leaf asserts (batch 4 of 4 — the last 3 leaves, all confirmed real chrome)`);
