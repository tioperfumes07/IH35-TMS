#!/usr/bin/env node
/**
 * verify-accounting-sortable-headers.mjs — BANK-SORT-ROLLOUT-ACCT CI guard
 *
 * Locks: every visible DATA column header on Accounting Bills (BillsPage) + Expenses
 * (ExpensesListPage) is clickable ASC/DESC, and the sort state is persisted in the URL
 * (?sort=&dir=) via the shared `useUrlSort` hook + ParityTable's controlled-sort props —
 * same asc/desc-only header contract the Banking register (BANK-SORT-ROLLOUT) shipped.
 *
 * Usage:
 *   node scripts/verify-accounting-sortable-headers.mjs
 *   node scripts/verify-accounting-sortable-headers.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
 * reports which ones are missing `sortable: true`.
 */
export function findNonSortableDataColumns(source) {
  const offenders = [];
  const re = /\{\s*\n?\s*key:\s*["']([^"']+)["']/g;
  let match;
  while ((match = re.exec(source))) {
    const start = match.index;
    const key = match[1];
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

export function sortableHeaderErrors({ hookSrc, parityTableSrc, pages }) {
  const failures = [];

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

  for (const { file, label, src } of pages) {
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
    if (file.includes("ExpensesListPage") && /key:\s*["']payee["']/.test(src)) {
      if (!/key:\s*["']payee["'][\s\S]*?sortValue\s*:/.test(src)) {
        failures.push(`${file} (${label}) — payee column must set sortValue (derived from vendor/driver)`);
      }
    }
  }

  return failures;
}

function selftest() {
  const goodHook = `
    export function useUrlSort({ key: "sort", dir: "dir" } = {}) {
      const [params] = useSearchParams();
    }
  `;
  const goodParity = `
    sortKey?: string;
    onSortChange?: (key: string, dir: "asc" | "desc") => void;
    sortValue?: (row: T) => string | number | null;
    const isSortControlled = sortKey != null;
  `;
  const goodPage = `
    import { useUrlSort } from "../../hooks/useUrlSort";
    const { sortKey, sortDirection, onSortChange } = useUrlSort();
    columns={[
      { key: "date", sortable: true },
      { key: "amount", sortable: true },
      { key: "actions", label: "Actions" },
    ]}
    <ParityTable sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
  `;
  const goodExpenses = `${goodPage}
    { key: "payee", sortable: true, sortValue: (row) => row.payee }
  `;

  const good = {
    hookSrc: goodHook,
    parityTableSrc: goodParity,
    pages: [
      { file: PAGES[0].file, label: PAGES[0].label, src: goodPage },
      { file: PAGES[1].file, label: PAGES[1].label, src: goodExpenses },
    ],
  };

  const planted = [
    ["missing useUrlSort export", { ...good, hookSrc: goodHook.replace("export function useUrlSort", "function useUrlSort") }, "must export function useUrlSort"],
    ["ParityTable missing controlled sort", { ...good, parityTableSrc: goodParity.replace("sortKey?: string", "") }, "sortKey?: string"],
    ["Bills missing sortKey wiring", { ...good, pages: [{ ...good.pages[0], src: goodPage.replace("sortKey={sortKey}", "") }, good.pages[1]] }, "sortKey={sortKey}"],
    ["Expenses missing sortable column", { ...good, pages: [good.pages[0], { ...good.pages[1], src: goodExpenses.replace("sortable: true, sortValue", "sortValue") }] }, "missing sortable: true"],
    ["Expenses payee missing sortValue", { ...good, pages: [good.pages[0], { ...good.pages[1], src: goodExpenses.replace(", sortValue: (row) => row.payee", "") }] }, "payee column must set sortValue"],
  ];

  const goodErrors = sortableHeaderErrors(good);
  const missed = planted.filter(([, fixture, needle]) => !sortableHeaderErrors(fixture).some((f) => f.includes(needle)));
  if (goodErrors.length || missed.length) {
    console.error(`${LABEL} --selftest FAIL`);
    for (const error of goodErrors) console.error(`  good fixture rejected: ${error}`);
    for (const [name] of missed) console.error(`  planted regression not caught: ${name}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${planted.length} planted regressions caught)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = sortableHeaderErrors({
  hookSrc: readFile(HOOK_FILE),
  parityTableSrc: readFile(PARITY_TABLE_FILE),
  pages: PAGES.map(({ file, label }) => ({ file, label, src: readFile(file) })),
});

if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log(
  `${LABEL} — OK (useUrlSort hook, ParityTable controlled-sort contract, Bills + Expenses every ` +
    `data column sortable + URL-persisted)`,
);
