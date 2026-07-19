#!/usr/bin/env node
/**
 * verify-account-register-url-sort.mjs — BANK-SORT-ROLLOUT-ACCT CI guard
 *
 * Locks: AccountRegisterPage — every register DATA column is ASC/DESC sortable and sort
 * persists in the URL (?sort=&dir=) via useUrlSort + ParityTable controlled-sort props.
 *
 * Usage:
 *   node scripts/verify-account-register-url-sort.mjs
 *   node scripts/verify-account-register-url-sort.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-account-register-url-sort";
const PAGE_FILE = "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx";
const HOOK_FILE = "apps/frontend/src/hooks/useUrlSort.ts";

const DATA_COLUMNS = [
  "entry_date",
  "reference",
  "payee",
  "memo",
  "class_name",
  "payment",
  "deposit",
  "running_balance_cents",
  "type",
  "split_account",
  "location",
  "cr",
];

function readFile(relPath) {
  const abs = path.join(ROOT, relPath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

function extractColumnsBlock(source) {
  const marker = "const columns:";
  const start = source.indexOf(marker);
  if (start < 0) return null;
  const eq = source.indexOf("=", start);
  if (eq < 0) return null;
  const arrStart = source.indexOf("[", eq);
  if (arrStart < 0) return null;
  let depth = 0;
  for (let i = arrStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return source.slice(arrStart, i + 1);
    }
  }
  return null;
}

function findNonSortableDataColumns(columnsBlock) {
  const offenders = [];
  const re = /\{\s*\n?\s*key:\s*["']([^"']+)["']/g;
  let match;
  while ((match = re.exec(columnsBlock))) {
    const start = match.index;
    const key = match[1];
    let depth = 0;
    let end = start;
    for (let i = start; i < columnsBlock.length; i++) {
      const ch = columnsBlock[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    const block = columnsBlock.slice(start, end);
    if (!/sortable\s*:\s*true/.test(block)) offenders.push(key);
  }
  return offenders;
}

export function accountRegisterUrlSortErrors({ hookSrc, pageSrc }) {
  const failures = [];
  if (!hookSrc) failures.push(`${HOOK_FILE} — MISSING`);
  else if (!/export function useUrlSort/.test(hookSrc)) failures.push(`${HOOK_FILE} — must export useUrlSort`);
  if (!pageSrc) {
    failures.push(`${PAGE_FILE} — MISSING`);
    return failures;
  }
  if (!/from ["'].*useUrlSort["']/.test(pageSrc)) failures.push(`${PAGE_FILE} — must import useUrlSort`);
  if (!/useUrlSort\s*\(/.test(pageSrc)) failures.push(`${PAGE_FILE} — must call useUrlSort()`);
  if (!/sortKey=\{sortKey\}/.test(pageSrc)) failures.push(`${PAGE_FILE} — must wire sortKey={sortKey}`);
  if (!/sortDirection=\{sortDirection\}/.test(pageSrc)) failures.push(`${PAGE_FILE} — must wire sortDirection={sortDirection}`);
  if (!/onSortChange=\{onSortChange\}/.test(pageSrc)) failures.push(`${PAGE_FILE} — must wire onSortChange={onSortChange}`);
  const columnsBlock = extractColumnsBlock(pageSrc);
  if (!columnsBlock) failures.push(`${PAGE_FILE} — must define const columns: ParityColumn array`);
  else {
    for (const col of DATA_COLUMNS) {
      if (!new RegExp(`key:\\s*["']${col}["']`).test(columnsBlock)) {
        failures.push(`${PAGE_FILE} — column "${col}" must exist in columns`);
      }
    }
    const bad = findNonSortableDataColumns(columnsBlock);
    if (bad.length) failures.push(`${PAGE_FILE} — data column(s) missing sortable: true: ${bad.join(", ")}`);
  }
  return failures;
}

function selftest() {
  const goodHook = `export function useUrlSort() { useSearchParams(); }`;
  const goodPage = `
    import { useUrlSort } from "../../hooks/useUrlSort";
    const { sortKey, sortDirection, onSortChange } = useUrlSort();
    const columns: Array<ParityColumn<AccountRegisterRow>> = [
      { key: "entry_date", sortable: true },
      { key: "reference", sortable: true },
      { key: "payee", sortable: true },
      { key: "memo", sortable: true },
      { key: "class_name", sortable: true },
      { key: "payment", sortable: true },
      { key: "deposit", sortable: true },
      { key: "running_balance_cents", sortable: true },
      { key: "type", sortable: true },
      { key: "split_account", sortable: true },
      { key: "location", sortable: true },
      { key: "cr", sortable: true },
    ];
    <ParityTable sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
  `;
  const good = { hookSrc: goodHook, pageSrc: goodPage };
  const planted = [
    ["no useUrlSort", { ...good, pageSrc: goodPage.replace("useUrlSort()", "noop()") }, "must call useUrlSort()"],
    ["no sortKey", { ...good, pageSrc: goodPage.replace("sortKey={sortKey}", "") }, "sortKey={sortKey}"],
    [
      "missing sortable",
      { ...good, pageSrc: goodPage.replace('{ key: "payee", sortable: true }', '{ key: "payee" }') },
      "missing sortable: true: payee",
    ],
  ];
  const goodErrors = accountRegisterUrlSortErrors(good);
  const missed = planted.filter(([, fixture, needle]) => !accountRegisterUrlSortErrors(fixture).some((f) => f.includes(needle)));
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

const failures = accountRegisterUrlSortErrors({
  hookSrc: readFile(HOOK_FILE),
  pageSrc: readFile(PAGE_FILE),
});
if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} — OK (AccountRegisterPage — every data column sortable + URL-persisted via useUrlSort)`);
