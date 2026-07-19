#!/usr/bin/env node
/**
 * verify-items-list-url-sort.mjs — BANK-SORT-ROLLOUT-ACCT CI guard
 *
 * Locks: ItemsListPage (lists/accounting Products & Services) — every visible DATA column
 * header is ASC/DESC sortable and sort persists in the URL (?sort=&dir=) via useUrlSort +
 * ParityTable controlled-sort props (same contract as ExpensesListPage / BillDetailPage).
 *
 * Usage:
 *   node scripts/verify-items-list-url-sort.mjs
 *   node scripts/verify-items-list-url-sort.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-items-list-url-sort";
const PAGE_FILE = "apps/frontend/src/pages/lists/accounting/ItemsListPage.tsx";
const HOOK_FILE = "apps/frontend/src/hooks/useUrlSort.ts";
/** Data columns that must remain header-sortable (rowActions is a prop, not a column). */
const REQUIRED_SORTABLE = ["display_name", "type", "category", "income", "expense", "status"];
const EXEMPT = new Set(["actions", "action", "delete", "allocate", "expand", "controls"]);

function readFile(relPath) {
  const abs = path.join(ROOT, relPath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

function findNonSortableDataColumns(source) {
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
    if (EXEMPT.has(key)) continue;
    if (!/label\s*:/.test(block)) continue;
    if (!/sortable\s*:\s*true/.test(block)) offenders.push(key);
  }
  return offenders;
}

function countParityTablesWithControlledSort(source) {
  const blocks = source.match(/<ParityTable[\s\S]*?\/>/g) ?? [];
  return blocks.filter(
    (b) => /sortKey=\{/.test(b) && /sortDirection=\{/.test(b) && /onSortChange=\{/.test(b),
  ).length;
}

export function itemsListUrlSortErrors({ hookSrc, pageSrc }) {
  const failures = [];
  if (!hookSrc) failures.push(`${HOOK_FILE} — MISSING`);
  else if (!/export function useUrlSort/.test(hookSrc)) failures.push(`${HOOK_FILE} — must export useUrlSort`);

  if (!pageSrc) {
    failures.push(`${PAGE_FILE} — MISSING`);
    return failures;
  }
  if (!/from ["'].*useUrlSort["']/.test(pageSrc)) failures.push(`${PAGE_FILE} — must import useUrlSort`);
  if (!/useUrlSort\s*\(/.test(pageSrc)) failures.push(`${PAGE_FILE} — must call useUrlSort()`);
  const sortedTables = countParityTablesWithControlledSort(pageSrc);
  // Grouped + flat list modes each render a ParityTable; both must be URL-controlled.
  if (sortedTables < 2) {
    failures.push(
      `${PAGE_FILE} — need 2 ParityTables with sortKey/sortDirection/onSortChange (found ${sortedTables})`,
    );
  }
  for (const col of REQUIRED_SORTABLE) {
    const startRe = new RegExp(`\\{\\s*\\n?\\s*key:\\s*["']${col}["']`);
    const startMatch = startRe.exec(pageSrc);
    if (!startMatch) {
      failures.push(`${PAGE_FILE} — column "${col}" must be defined`);
      continue;
    }
    let depth = 0;
    let end = startMatch.index;
    for (let i = startMatch.index; i < pageSrc.length; i++) {
      const ch = pageSrc[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    const block = pageSrc.slice(startMatch.index, end);
    if (!/sortable\s*:\s*true/.test(block)) {
      failures.push(`${PAGE_FILE} — column "${col}" must have sortable: true`);
    }
  }
  const bad = findNonSortableDataColumns(pageSrc);
  if (bad.length) failures.push(`${PAGE_FILE} — data column(s) missing sortable: true: ${bad.join(", ")}`);
  return failures;
}

function selftest() {
  const goodHook = `export function useUrlSort() { useSearchParams(); }`;
  const goodPage = `
    import { useUrlSort } from "../../../hooks/useUrlSort";
    const { sortKey, sortDirection, onSortChange } = useUrlSort();
    { key: "display_name", label: "Name", sortable: true }
    { key: "type", label: "Type / Sides", sortable: true }
    { key: "category", label: "Category", sortable: true }
    { key: "income", label: "Income account", sortable: true }
    { key: "expense", label: "Expense account", sortable: true }
    { key: "status", label: "Status", sortable: true }
    <ParityTable sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
    <ParityTable sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
  `;
  const good = { hookSrc: goodHook, pageSrc: goodPage };
  const planted = [
    ["no useUrlSort", { ...good, pageSrc: goodPage.replace("useUrlSort()", "noop()") }, "must call useUrlSort()"],
    [
      "missing sortable Name",
      { ...good, pageSrc: goodPage.replace('"Name", sortable: true', '"Name"') },
      'column "display_name" must have sortable: true',
    ],
    [
      "no controlled sort on second table",
      {
        ...good,
        pageSrc: goodPage.replace(
          /<ParityTable sortKey=\{sortKey\} sortDirection=\{sortDirection\} onSortChange=\{onSortChange\} \/>\s*<ParityTable sortKey=\{sortKey\} sortDirection=\{sortDirection\} onSortChange=\{onSortChange\} \/>/,
          `<ParityTable sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
    <ParityTable />`,
        ),
      },
      "sortKey/sortDirection/onSortChange",
    ],
  ];
  const goodErrors = itemsListUrlSortErrors(good);
  const missed = planted.filter(([, fixture, needle]) =>
    !itemsListUrlSortErrors(fixture).some((f) => f.includes(needle)),
  );
  if (goodErrors.length || missed.length) {
    console.error(`${LABEL} --selftest FAIL`);
    for (const e of goodErrors) console.error(`  good rejected: ${e}`);
    for (const [n] of missed) console.error(`  missed: ${n}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${planted.length} planted regressions caught)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = itemsListUrlSortErrors({
  hookSrc: readFile(HOOK_FILE),
  pageSrc: readFile(PAGE_FILE),
});
if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(
  `${LABEL} — OK (ItemsListPage — every data column sortable + URL sort via useUrlSort)`,
);
