#!/usr/bin/env node
/**
 * verify-accounting-sortable-headers.mjs — BANK-SORT-ROLLOUT-ACCT CI guard
 *
 * Locks: every visible DATA column header on Accounting Bills (BillsPage) + Expenses
 * (ExpensesListPage) is clickable ASC/DESC, and the sort state is persisted in the URL
 * (?sort=&dir=) via the shared `useUrlSort` hook + ParityTable's controlled-sort props —
 * same asc/desc-only header contract the Banking register (BANK-SORT-ROLLOUT) shipped.
 *
 * Checks:
 *   1. apps/frontend/src/hooks/useUrlSort.ts exists and exports useUrlSort (sort/dir params).
 *   2. ParityTable.tsx supports the OPTIONAL controlled-sort contract:
 *      sortKey / sortDirection / onSortChange props + a `sortValue` column extractor.
 *   3. BillsPage.tsx + ExpensesListPage.tsx:
 *        - import + call useUrlSort()
 *        - wire its `sortKey` / `sortDirection` / `onSortChange` onto <ParityTable ... />
 *        - every DATA column (i.e. not a pure-action column, see EXEMPT_COLUMN_KEYS) has
 *          `sortable: true`
 *
 * Usage: node scripts/verify-accounting-sortable-headers.mjs
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify-accounting-sortable-headers";

const HOOK_FILE = "apps/frontend/src/hooks/useUrlSort.ts";
const PARITY_TABLE_FILE = "apps/frontend/src/components/parity/ParityTable.tsx";
const PAGES = [
  { file: "apps/frontend/src/pages/accounting/BillsPage.tsx", label: "Bills" },
  { file: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx", label: "Expenses" },
];

/** Pure action / non-data columns are exempt from the sortable-header rule (GLOBAL-SORT-RULE.md). */
const EXEMPT_COLUMN_KEYS = new Set(["actions", "action", "delete", "allocate", "expand", "controls"]);

function readFile(relPath) {
  const abs = path.join(ROOT, relPath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

/**
 * Extracts `{ key: "...", ... }` column-literal blocks from a columns array/useMemo body and
 * reports which ones are missing `sortable: true`. Column objects in this codebase span
 * multiple lines, so we scan brace-balanced blocks starting at each `key:` occurrence rather
 * than matching single lines (unlike the single-line GLOBAL-SORT-RULE scan).
 */
function findNonSortableDataColumns(source) {
  const offenders = [];
  const re = /\{\s*\n?\s*key:\s*["']([^"']+)["']/g;
  let match;
  while ((match = re.exec(source))) {
    const start = match.index;
    const key = match[1];
    // Walk forward to find the matching closing brace for this column object literal.
    let depth = 0;
    let end = start;
    for (let i = start; i < source.length; i++) {
      const ch = source[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    const block = source.slice(start, end);
    if (EXEMPT_COLUMN_KEYS.has(key)) continue;
    if (!/sortable\s*:\s*true/.test(block)) {
      offenders.push(key);
    }
  }
  return offenders;
}

const failures = [];

// ---------------------------------------------------------------------------
// 1. useUrlSort hook
// ---------------------------------------------------------------------------
const hookSrc = readFile(HOOK_FILE);
if (!hookSrc) {
  failures.push(`${HOOK_FILE} — MISSING`);
} else {
  if (!/export function useUrlSort/.test(hookSrc)) {
    failures.push(`${HOOK_FILE} — must export function useUrlSort`);
  }
  if (!/useSearchParams/.test(hookSrc)) {
    failures.push(`${HOOK_FILE} — must read/write via react-router useSearchParams`);
  }
  if (!/key:\s*"sort"/.test(hookSrc) && !/keyParam/.test(hookSrc)) {
    failures.push(`${HOOK_FILE} — must default the sort key param to "sort"`);
  }
  if (!/dir:\s*"dir"/.test(hookSrc) && !/dirParam/.test(hookSrc)) {
    failures.push(`${HOOK_FILE} — must default the sort direction param to "dir"`);
  }
}

// ---------------------------------------------------------------------------
// 2. ParityTable controlled-sort contract
// ---------------------------------------------------------------------------
const parityTableSrc = readFile(PARITY_TABLE_FILE);
if (!parityTableSrc) {
  failures.push(`${PARITY_TABLE_FILE} — MISSING`);
} else {
  if (!/sortKey\?:\s*string/.test(parityTableSrc)) {
    failures.push(`${PARITY_TABLE_FILE} — ParityTableProps must declare optional sortKey?: string`);
  }
  if (!/onSortChange\?:\s*\(/.test(parityTableSrc)) {
    failures.push(`${PARITY_TABLE_FILE} — ParityTableProps must declare optional onSortChange callback`);
  }
  if (!/sortValue\?:\s*\(row:\s*T\)/.test(parityTableSrc)) {
    failures.push(`${PARITY_TABLE_FILE} — ParityColumn must declare optional sortValue?: (row: T) => ...`);
  }
  if (!/isSortControlled/.test(parityTableSrc)) {
    failures.push(`${PARITY_TABLE_FILE} — must branch controlled vs internal sort state (isSortControlled)`);
  }
}

// ---------------------------------------------------------------------------
// 3. Bills + Expenses pages
// ---------------------------------------------------------------------------
for (const { file, label } of PAGES) {
  const src = readFile(file);
  if (!src) {
    failures.push(`${file} — MISSING`);
    continue;
  }
  if (!/useUrlSort\s*\(/.test(src)) {
    failures.push(`${file} (${label}) — must call useUrlSort() to persist sort in the URL`);
  }
  if (!/from ["'].*useUrlSort["']/.test(src)) {
    failures.push(`${file} (${label}) — must import useUrlSort from the shared hook`);
  }
  if (!/sortKey=\{sortKey\}/.test(src)) {
    failures.push(`${file} (${label}) — must wire sortKey={sortKey} onto <ParityTable>`);
  }
  if (!/sortDirection=\{sortDirection\}/.test(src)) {
    failures.push(`${file} (${label}) — must wire sortDirection={sortDirection} onto <ParityTable>`);
  }
  if (!/onSortChange=\{onSortChange\}/.test(src)) {
    failures.push(`${file} (${label}) — must wire onSortChange={onSortChange} onto <ParityTable>`);
  }
  const nonSortable = findNonSortableDataColumns(src);
  if (nonSortable.length > 0) {
    failures.push(
      `${file} (${label}) — data column(s) missing sortable: true: ${nonSortable.join(", ")}`,
    );
  }
  // Derived columns (key not a plain row field) must supply sortValue or the header is a no-op.
  if (file.includes("ExpensesListPage") && /key:\s*["']payee["']/.test(src)) {
    if (!/key:\s*["']payee["'][\s\S]*?sortValue\s*:/.test(src)) {
      failures.push(`${file} (${label}) — payee column must set sortValue (derived from vendor/driver)`);
    }
  }
}

if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log(
  `${LABEL} — OK (useUrlSort hook, ParityTable controlled-sort contract, Bills + Expenses every ` +
    `data column sortable + URL-persisted)`,
);
