#!/usr/bin/env node
/**
 * verify-ap-aging-url-sort.mjs — BANK-SORT-ROLLOUT-ACCT-AP2 CI guard
 *
 * Locks: AccountsPayableAgingPage (/accounting/accounts-payable) — the Accounting-module A/P aging
 * surface that uses a hand-rolled <table> + useTableController/TableHeaderCell stack (NOT ParityTable
 * like the Reports APAgingPage). Every visible data column header is ASC/DESC sortable and the sort
 * state persists in the URL (?sort=&dir=) via the shared useUrlSort hook feeding useTableController's
 * initialSortKey/initialSortDir/onSortChange seams — same contract FleetTable shipped under
 * BANK-SORT-ROLLOUT-OPS.
 *
 * Usage: node scripts/verify-ap-aging-url-sort.mjs
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify-ap-aging-url-sort";

const PAGE_FILE = "apps/frontend/src/pages/accounting/AccountsPayableAgingPage.tsx";
const HOOK_FILE = "apps/frontend/src/hooks/useUrlSort.ts";

/** Every data column on the By Vendor view (COLUMNS const). */
const DATA_COLUMNS = ["vendor", "type", "current", "d1_30", "d31_60", "d61_90", "d90_plus", "total"];

function readFile(relPath) {
  const abs = path.join(ROOT, relPath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

const failures = [];

if (!readFile(HOOK_FILE)) {
  failures.push(`${HOOK_FILE} — MISSING (required by AccountsPayableAgingPage URL-sort wiring)`);
}

const src = readFile(PAGE_FILE);
if (!src) {
  failures.push(`${PAGE_FILE} — MISSING`);
} else {
  if (!/from ["'].*useUrlSort["']/.test(src)) {
    failures.push(`${PAGE_FILE} — must import useUrlSort from the shared hook`);
  }
  if (!/useUrlSort\s*\(/.test(src)) {
    failures.push(`${PAGE_FILE} — must call useUrlSort() to persist sort in the URL`);
  }
  if (!/initialSortKey:\s*urlSort\.sortKey/.test(src)) {
    failures.push(`${PAGE_FILE} — must seed useTableController from urlSort.sortKey`);
  }
  if (!/initialSortDir:\s*urlSort\.sortDirection/.test(src)) {
    failures.push(`${PAGE_FILE} — must seed useTableController from urlSort.sortDirection`);
  }
  if (!/onSortChange:[\s\S]{0,80}urlSort\.onSortChange/.test(src)) {
    failures.push(`${PAGE_FILE} — must mirror header clicks back into the URL via urlSort.onSortChange`);
  }
  if (!/TableHeaderCell/.test(src)) {
    failures.push(`${PAGE_FILE} — must render sortable headers via TableHeaderCell`);
  }
  if (!/useTableController/.test(src)) {
    failures.push(`${PAGE_FILE} — must use useTableController for client-side sort`);
  }
  for (const col of DATA_COLUMNS) {
    if (!new RegExp(`key:\\s*["']${col}["']`).test(src)) {
      failures.push(`${PAGE_FILE} — column "${col}" must be defined in COLUMNS`);
    }
  }
}

if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log(
  `${LABEL} — OK (AccountsPayableAgingPage — every data column sortable + URL-persisted via useUrlSort)`,
);
