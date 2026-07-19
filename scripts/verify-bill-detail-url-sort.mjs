#!/usr/bin/env node
/**
 * verify-bill-detail-url-sort.mjs — BANK-SORT-ROLLOUT-ACCT CI guard
 *
 * Locks: BillDetailPage payments ParityTable — Date / Amount / Method columns are ASC/DESC
 * sortable and sort persists in the URL (?sort=&dir=) via useUrlSort + ParityTable controlled-sort props
 * (same contract as ExpensesListPage / FactoringDetailPage).
 *
 * Usage:
 *   node scripts/verify-bill-detail-url-sort.mjs
 *   node scripts/verify-bill-detail-url-sort.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bill-detail-url-sort";
const PAGE_FILE = "apps/frontend/src/pages/accounting/BillDetailPage.tsx";
const HOOK_FILE = "apps/frontend/src/hooks/useUrlSort.ts";
/** Payment data columns that must remain header-sortable (Reference / Check / Reconciled are display-only). */
const REQUIRED_SORTABLE = ["payment_date", "amount_cents", "payment_method"];
const EXEMPT = new Set([
  "actions",
  "action",
  "delete",
  "allocate",
  "expand",
  "controls",
  "reference_number",
  "check_number",
  "is_reconciled",
]);

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

export function billDetailUrlSortErrors({ hookSrc, pageSrc }) {
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
  if (sortedTables < 1) {
    failures.push(
      `${PAGE_FILE} — need 1 ParityTable with sortKey/sortDirection/onSortChange (found ${sortedTables})`,
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
    import { useUrlSort } from "../../hooks/useUrlSort";
    const { sortKey, sortDirection, onSortChange } = useUrlSort();
    { key: "payment_date", label: "Date", sortable: true }
    { key: "amount_cents", label: "Amount", sortable: true }
    { key: "payment_method", label: "Method", sortable: true }
    { key: "reference_number", label: "Reference" }
    <ParityTable sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
  `;
  const good = { hookSrc: goodHook, pageSrc: goodPage };
  const planted = [
    ["no useUrlSort", { ...good, pageSrc: goodPage.replace("useUrlSort()", "noop()") }, "must call useUrlSort()"],
    [
      "missing sortable Date",
      { ...good, pageSrc: goodPage.replace('"Date", sortable: true', '"Date"') },
      'column "payment_date" must have sortable: true',
    ],
    [
      "no controlled sort",
      { ...good, pageSrc: goodPage.replace("onSortChange={onSortChange}", "") },
      "sortKey/sortDirection/onSortChange",
    ],
  ];
  const goodErrors = billDetailUrlSortErrors(good);
  const missed = planted.filter(([, fixture, needle]) =>
    !billDetailUrlSortErrors(fixture).some((f) => f.includes(needle)),
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

const failures = billDetailUrlSortErrors({
  hookSrc: readFile(HOOK_FILE),
  pageSrc: readFile(PAGE_FILE),
});
if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(
  `${LABEL} — OK (BillDetailPage — payment Date/Amount/Method sortable + URL sort via useUrlSort)`,
);
