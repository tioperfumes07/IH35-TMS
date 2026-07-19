#!/usr/bin/env node
/**
 * verify-receipts-integration-url-sort.mjs — BANK-SORT-ROLLOUT-ACCT CI guard
 *
 * Locks: ReceiptsPage + IntegrationTransactionsPage — every visible DATA column header is
 * ASC/DESC sortable and sort persists in the URL (?sort=&dir=) via useUrlSort + ParityTable
 * controlled-sort props (same contract as ExpensesListPage).
 *
 * Usage:
 *   node scripts/verify-receipts-integration-url-sort.mjs
 *   node scripts/verify-receipts-integration-url-sort.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-receipts-integration-url-sort";
const PAGE_FILES = [
  "apps/frontend/src/pages/accounting/ReceiptsPage.tsx",
  "apps/frontend/src/pages/accounting/IntegrationTransactionsPage.tsx",
];
const HOOK_FILE = "apps/frontend/src/hooks/useUrlSort.ts";
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
    if (!/sortable\s*:\s*true/.test(block)) offenders.push(key);
  }
  return offenders;
}

export function pageUrlSortErrors(pageFile, pageSrc) {
  const failures = [];
  if (!pageSrc) {
    failures.push(`${pageFile} — MISSING`);
    return failures;
  }
  if (!/from ["'].*useUrlSort["']/.test(pageSrc)) failures.push(`${pageFile} — must import useUrlSort`);
  if (!/useUrlSort\s*\(/.test(pageSrc)) failures.push(`${pageFile} — must call useUrlSort()`);
  if (!/sortKey=\{sortKey\}/.test(pageSrc)) failures.push(`${pageFile} — must wire sortKey={sortKey}`);
  if (!/sortDirection=\{sortDirection\}/.test(pageSrc)) failures.push(`${pageFile} — must wire sortDirection={sortDirection}`);
  if (!/onSortChange=\{onSortChange\}/.test(pageSrc)) failures.push(`${pageFile} — must wire onSortChange={onSortChange}`);
  const bad = findNonSortableDataColumns(pageSrc);
  if (bad.length) failures.push(`${pageFile} — data column(s) missing sortable: true: ${bad.join(", ")}`);
  return failures;
}

export function receiptsIntegrationUrlSortErrors({ hookSrc, pages }) {
  const failures = [];
  if (!hookSrc) failures.push(`${HOOK_FILE} — MISSING`);
  else if (!/export function useUrlSort/.test(hookSrc)) failures.push(`${HOOK_FILE} — must export useUrlSort`);
  for (const [pageFile, pageSrc] of pages) {
    failures.push(...pageUrlSortErrors(pageFile, pageSrc));
  }
  return failures;
}

function selftest() {
  const goodHook = `export function useUrlSort() { useSearchParams(); }`;
  const goodPage = `
    import { useUrlSort } from "../../hooks/useUrlSort";
    const { sortKey, sortDirection, onSortChange } = useUrlSort();
    columns={[{ key: "display_id", sortable: true }, { key: "status", sortable: true }]}
    <ParityTable sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
  `;
  const good = {
    hookSrc: goodHook,
    pages: [
      ["ReceiptsPage.tsx", goodPage],
      ["IntegrationTransactionsPage.tsx", goodPage],
    ],
  };
  const planted = [
    ["no useUrlSort", { ...good, pages: [["P.tsx", goodPage.replace("useUrlSort()", "noop()")]] }, "must call useUrlSort()"],
    ["no sortKey", { ...good, pages: [["P.tsx", goodPage.replace("sortKey={sortKey}", "")]] }, "sortKey={sortKey}"],
    ["missing sortable", { ...good, pages: [["P.tsx", goodPage.replace('sortable: true }, { key: "status"', '}, { key: "status"')]] }, "missing sortable: true"],
  ];
  const goodErrors = receiptsIntegrationUrlSortErrors(good);
  const missed = planted.filter(([, fixture, needle]) => !receiptsIntegrationUrlSortErrors(fixture).some((f) => f.includes(needle)));
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

const failures = receiptsIntegrationUrlSortErrors({
  hookSrc: readFile(HOOK_FILE),
  pages: PAGE_FILES.map((f) => [f, readFile(f)]),
});
if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(
  `${LABEL} — OK (ReceiptsPage + IntegrationTransactionsPage — every data column sortable + URL-persisted via useUrlSort)`,
);
