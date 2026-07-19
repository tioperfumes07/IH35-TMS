#!/usr/bin/env node
/**
 * verify-factoring-invoice-detail-url-sort.mjs — BANK-SORT-ROLLOUT-ACCT CI guard
 *
 * Locks: FactoringDetailPage + InvoiceDetailPage — every visible DATA column header is ASC/DESC
 * sortable and sort persists in the URL (?sort=&dir=) via useUrlSort + ParityTable controlled-sort props.
 *
 * Usage:
 *   node scripts/verify-factoring-invoice-detail-url-sort.mjs
 *   node scripts/verify-factoring-invoice-detail-url-sort.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-invoice-detail-url-sort";
const HOOK_FILE = "apps/frontend/src/hooks/useUrlSort.ts";
const PAGES = [
  {
    file: "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx",
    label: "Factoring Detail",
    minSortedParityTables: 1,
  },
  {
    file: "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx",
    label: "Invoice Detail",
    minSortedParityTables: 1,
  },
];
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

export function factoringInvoiceDetailUrlSortErrors({ hookSrc, pages }) {
  const failures = [];
  if (!hookSrc) failures.push(`${HOOK_FILE} — MISSING`);
  else if (!/export function useUrlSort/.test(hookSrc)) failures.push(`${HOOK_FILE} — must export useUrlSort`);

  for (const page of pages) {
    const pageSrc = page.pageSrc;
    if (!pageSrc) {
      failures.push(`${page.file} — MISSING`);
      continue;
    }
    if (!/from ["'].*useUrlSort["']/.test(pageSrc)) failures.push(`${page.file} — must import useUrlSort`);
    if (!/useUrlSort\s*\(/.test(pageSrc)) failures.push(`${page.file} — must call useUrlSort()`);
    const sortedTables = countParityTablesWithControlledSort(pageSrc);
    if (sortedTables < page.minSortedParityTables) {
      failures.push(
        `${page.file} — need ${page.minSortedParityTables} ParityTable(s) with sortKey/sortDirection/onSortChange (found ${sortedTables})`,
      );
    }
    const bad = findNonSortableDataColumns(pageSrc);
    if (bad.length) failures.push(`${page.file} — data column(s) missing sortable: true: ${bad.join(", ")}`);
  }
  return failures;
}

function selftest() {
  const goodHook = `export function useUrlSort() { useSearchParams(); }`;
  const goodFactoring = `
    import { useUrlSort } from "../../hooks/useUrlSort";
    const { sortKey, sortDirection, onSortChange } = useUrlSort();
    { key: "display_id", label: "Invoice #", sortable: true }
    { key: "customer_name", label: "Customer", sortable: true }
    <ParityTable sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
  `;
  const goodInvoice = `
    import { useUrlSort } from "../../hooks/useUrlSort";
    const { sortKey, sortDirection, onSortChange } = useUrlSort();
    { key: "line_type", label: "Type", sortable: true }
    { key: "quantity", label: "Qty", sortable: true }
    { key: "actions", label: "Actions" }
    <ParityTable sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
  `;
  const pages = [
    { file: PAGES[0].file, label: "Factoring Detail", minSortedParityTables: 1, pageSrc: goodFactoring },
    { file: PAGES[1].file, label: "Invoice Detail", minSortedParityTables: 1, pageSrc: goodInvoice },
  ];
  const good = { hookSrc: goodHook, pages };
  const planted = [
    [
      "factoring no useUrlSort",
      {
        ...good,
        pages: [{ ...pages[0], pageSrc: goodFactoring.replace("useUrlSort()", "noop()") }, pages[1]],
      },
      "FactoringDetailPage.tsx — must call useUrlSort()",
    ],
    [
      "invoice missing sortable",
      {
        ...good,
        pages: [
          pages[0],
          {
            ...pages[1],
            pageSrc: goodInvoice.replace('"Qty", sortable: true', '"Qty"'),
          },
        ],
      },
      "missing sortable: true: quantity",
    ],
    [
      "invoice no controlled sort",
      {
        ...good,
        pages: [
          pages[0],
          {
            ...pages[1],
            pageSrc: goodInvoice.replace("onSortChange={onSortChange}", ""),
          },
        ],
      },
      "sortKey/sortDirection/onSortChange",
    ],
  ];
  const goodErrors = factoringInvoiceDetailUrlSortErrors(good);
  const missed = planted.filter(([, fixture, needle]) => !factoringInvoiceDetailUrlSortErrors(fixture).some((f) => f.includes(needle)));
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

const failures = factoringInvoiceDetailUrlSortErrors({
  hookSrc: readFile(HOOK_FILE),
  pages: PAGES.map((p) => ({ ...p, pageSrc: readFile(p.file) })),
});
if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(
  `${LABEL} — OK (FactoringDetailPage + InvoiceDetailPage — data columns sortable + URL sort via useUrlSort)`,
);
