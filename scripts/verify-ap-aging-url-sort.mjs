#!/usr/bin/env node
/**
 * verify-ap-aging-url-sort.mjs — BANK-SORT-ROLLOUT-ACCT-AP2 CI guard
 *
 * Locks: AccountsPayableAgingPage (/accounting/accounts-payable) — the Accounting-module A/P aging
 * surface. Every visible data column header is ASC/DESC sortable and the sort state persists in the
 * URL (?sort=&dir=) via the shared useUrlSort hook. Since the ParityTable migration (verify-step
 * 1147) the By Vendor grid is a <ParityTable> consuming useUrlSort through ParityTable's
 * controlled-sort props (sortKey / sortDirection / onSortChange) with a per-column `sortable: true`
 * + `sortValue` contract — the same wiring verify-accounting-sortable-headers.mjs locks for the
 * Bills / Expenses / Payments list pages. The pre-migration useTableController/TableHeaderCell
 * seams are gone; the user-facing contract (every data column sortable + URL-persisted) is
 * unchanged.
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
  if (!/<ParityTable\b/.test(src)) {
    failures.push(`${PAGE_FILE} — By Vendor grid must render via <ParityTable> (verify-step 1147)`);
  }
  if (!/sortKey=\{sortKey\}/.test(src)) {
    failures.push(`${PAGE_FILE} — must wire sortKey={sortKey} onto <ParityTable> (controlled URL sort)`);
  }
  if (!/sortDirection=\{sortDirection\}/.test(src)) {
    failures.push(`${PAGE_FILE} — must wire sortDirection={sortDirection} onto <ParityTable> (controlled URL sort)`);
  }
  if (!/onSortChange=\{onSortChange\}/.test(src)) {
    failures.push(`${PAGE_FILE} — must wire onSortChange={onSortChange} onto <ParityTable> (mirrors header clicks into the URL)`);
  }
  for (const col of DATA_COLUMNS) {
    const block = new RegExp(`key:\\s*["']${col}["'][\\s\\S]{0,240}?sortable:\\s*true`);
    if (!block.test(src)) {
      failures.push(`${PAGE_FILE} — column "${col}" must be defined with sortable: true`);
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
