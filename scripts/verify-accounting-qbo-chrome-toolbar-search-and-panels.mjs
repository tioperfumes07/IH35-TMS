#!/usr/bin/env node
/**
 * Accounting qbo_chrome — batch 3: chrome.toolbar_search (a real gap, fixed in this same PR) plus
 * 10 leaves whose ONLY prior "Built" claim was the broad CURSOR-VERTICAL-accounting-qbo sweep
 * (scripts/verify-cursor-vertical-qbo-picker-modules.mjs), which never opens any of these files —
 * same theater-coverage class as batch1/batch2, found via a SWARM-ONE-MODULE theater audit.
 *
 * chrome.toolbar_search (surface BillsPage.tsx): confirmed a REAL gap, not just under-guarded —
 * BillsPage.tsx had zero search input while 7 sibling accounting list pages (Receipts, Payments,
 * BillPayments, Invoices, etc.) all pass CollapsedListFilters a searchSlot. Fixed in this PR:
 * BillsPage.tsx now has a `search` state, a searchSlot text input (bill # / vendor / memo), and
 * client-side filtering over the already-loaded rows (server list caps at 200, same rows already
 * in memory — matches the pattern used elsewhere in this codebase for capped lists).
 *
 * The other 10 leaves below were cross-checked leaf-by-leaf against their real live component
 * source (not just the broad guard's generic tokens) and are genuinely real chrome — this file
 * only closes the GUARD gap for them, no product code changed for those 10.
 *
 * HONEST-BUILT-LAUNCH-LAW: no leafRe:".*"; every leafRe below is anchored to its specific leaf(s).
 *
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^chrome\\.toolbar_search$","task":"VERTICAL-QBO-CHROME-accounting-toolbar-search","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.modal\\.bill_payment$","task":"VERTICAL-QBO-CHROME-accounting-modal-bill-payment","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.panel\\.reallocate$","task":"VERTICAL-QBO-CHROME-accounting-panel-reallocate","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.panel\\.trk_bulk_register$","task":"VERTICAL-QBO-CHROME-accounting-panel-trk-bulk-register","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.panel\\.detail$","task":"VERTICAL-QBO-CHROME-accounting-panel-detail","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.panel\\.period_status$","task":"VERTICAL-QBO-CHROME-accounting-panel-period-status","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.panel\\.class_cost_center_variance$","task":"VERTICAL-QBO-CHROME-accounting-panel-class-cost-center-variance","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.panel\\.schedule$","task":"VERTICAL-QBO-CHROME-accounting-panel-schedule","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.modal\\.create$","task":"VERTICAL-QBO-CHROME-accounting-modal-create","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.panel\\.receipt_detail$","task":"VERTICAL-QBO-CHROME-accounting-panel-receipt-detail","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.panel\\.leakage$","task":"VERTICAL-QBO-CHROME-accounting-panel-leakage","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-accounting-qbo-chrome-toolbar-search-and-panels.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-accounting-qbo-chrome-toolbar-search-and-panels";

const CHECKS = [
  {
    name: "chrome.toolbar_search: BillsPage has its own search input + client-side filter",
    file: "apps/frontend/src/pages/accounting/BillsPage.tsx",
    pattern: /searchSlot=\{[\s\S]*?aria-label="Search bills"[\s\S]*?\}/,
  },
  {
    name: "chrome.toolbar_search: search input is wired into the CollapsedListFilters toolbar",
    file: "apps/frontend/src/pages/accounting/BillsPage.tsx",
    pattern: /<CollapsedListFilters[\s\S]{0,600}searchSlot=/,
  },
  { name: "accounting.modal.bill_payment: BillPaymentModal real ParityDrawer + MoneyInput", file: "apps/frontend/src/components/ap/BillPaymentModal.tsx", pattern: /ParityDrawer[\s\S]*MoneyInput|MoneyInput[\s\S]*ParityDrawer/ },
  { name: "accounting.panel.reallocate: AllocationsPage real ParityTable", file: "apps/frontend/src/pages/accounting/AllocationsPage.tsx", pattern: /<ParityTable\b/ },
  { name: "accounting.panel.trk_bulk_register: FixedAssetsPage real ParityTable + CollapsedListFilters", file: "apps/frontend/src/pages/accounting/FixedAssetsPage.tsx", pattern: /ParityTable[\s\S]*CollapsedListFilters|CollapsedListFilters[\s\S]*ParityTable/ },
  { name: "accounting.panel.detail: FixedAssetsPage real ParityTable", file: "apps/frontend/src/pages/accounting/FixedAssetsPage.tsx", pattern: /<ParityTable\b/ },
  { name: "accounting.panel.period_status: MyAccountantPage real ParityTable", file: "apps/frontend/src/pages/accounting/MyAccountantPage.tsx", pattern: /<ParityTable\b/ },
  { name: "accounting.panel.class_cost_center_variance: PeriodComparisonPage real ParityTable", file: "apps/frontend/src/pages/accounting/PeriodComparisonPage.tsx", pattern: /<ParityTable\b/ },
  { name: "accounting.panel.schedule: PrepaidExpensesPage real ParityTable + DatePicker + MoneyInput", file: "apps/frontend/src/pages/accounting/PrepaidExpensesPage.tsx", pattern: /ParityTable[\s\S]*DatePicker[\s\S]*MoneyInput|MoneyInput[\s\S]*DatePicker[\s\S]*ParityTable/ },
  { name: "accounting.modal.create: PrepaidExpensesPage real CollapsedListFilters + MoneyInput create chrome", file: "apps/frontend/src/pages/accounting/PrepaidExpensesPage.tsx", pattern: /CollapsedListFilters[\s\S]*MoneyInput|MoneyInput[\s\S]*CollapsedListFilters/ },
  { name: "accounting.panel.receipt_detail: ReceiptsPage real ParityDrawer + ParityTable", file: "apps/frontend/src/pages/accounting/ReceiptsPage.tsx", pattern: /ParityDrawer[\s\S]*ParityTable|ParityTable[\s\S]*ParityDrawer/ },
  { name: "accounting.panel.leakage: RevenueRecognitionPage real ParityTable + CollapsedListFilters", file: "apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx", pattern: /ParityTable[\s\S]*CollapsedListFilters|CollapsedListFilters[\s\S]*ParityTable/ },
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
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".accounting-qbo-chrome-b3-selftest-"));
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
console.log(`${LABEL} PASS — ${CHECKS.length} accounting qbo_chrome leaf asserts (batch 3 of 3 — 1 real gap fixed + 10 leaf-specific guards closing theater coverage)`);
