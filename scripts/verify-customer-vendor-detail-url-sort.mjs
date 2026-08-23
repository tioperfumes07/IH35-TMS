#!/usr/bin/env node
/**
 * verify-customer-vendor-detail-url-sort.mjs — BANK-SORT-ROLLOUT-ACCT CI guard
 *
 * Locks: CustomerDetailPage + VendorDetailPage — every ParityTable data column is ASC/DESC
 * sortable and sort persists in the URL via useUrlSort + ParityTable controlled-sort props.
 * Multi-table pages use distinct URL param prefixes (EscrowPage pattern) so tables never fight.
 *
 * Usage:
 *   node scripts/verify-customer-vendor-detail-url-sort.mjs
 *   node scripts/verify-customer-vendor-detail-url-sort.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customer-vendor-detail-url-sort";
const HOOK_FILE = "apps/frontend/src/hooks/useUrlSort.ts";
const PAGES = [
  {
    file: "apps/frontend/src/pages/CustomerDetail.tsx",
    label: "Customer Detail",
    minSortedParityTables: 5,
    requiredPrefixes: [
      { key: "load_sort", dir: "load_dir" },
      { key: "contact_sort", dir: "contact_dir" },
      { key: "pay_sort", dir: "pay_dir" },
      { key: "lane_sort", dir: "lane_dir" },
      { key: "invoice_sort", dir: "invoice_dir" },
    ],
  },
  {
    file: "apps/frontend/src/pages/VendorDetail.tsx",
    label: "Vendor Detail",
    minSortedParityTables: 2,
    requiredPrefixes: [
      { key: "pay_sort", dir: "pay_dir" },
      { key: "bill_sort", dir: "bill_dir" },
    ],
  },
];
/** rowActions is a ParityTable prop, not a column — action keys stay exempt. */
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

function hasUrlSortPrefix(source, key, dir) {
  const keyRe = new RegExp(`key\\s*:\\s*["']${key}["']`);
  const dirRe = new RegExp(`dir\\s*:\\s*["']${dir}["']`);
  return keyRe.test(source) && dirRe.test(source);
}

export function customerVendorDetailUrlSortErrors({ hookSrc, pages }) {
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
    for (const prefix of page.requiredPrefixes) {
      if (!hasUrlSortPrefix(pageSrc, prefix.key, prefix.dir)) {
        failures.push(
          `${page.file} — must call useUrlSort({ key: "${prefix.key}", dir: "${prefix.dir}" })`,
        );
      }
    }
    const bad = findNonSortableDataColumns(pageSrc);
    if (bad.length) failures.push(`${page.file} — data column(s) missing sortable: true: ${bad.join(", ")}`);
    if (page.file.endsWith("VendorDetail.tsx")) {
      for (const query of ["vendorQuery", "billsQuery", "vendorExpensesQuery", "vendorCreditsQuery"]) {
        // Vendor detail legitimately renders an archived/not-in-company 404 branch
        // before its generic retry banner. Keep the matcher bounded, but allow that
        // honest branch instead of requiring the banner within 220 characters.
        const retry = new RegExp(`${query}\\.isError[\\s\\S]{0,1200}<ListErrorBanner[\\s\\S]{0,220}${query}\\.refetch\\(\\)`);
        if (!retry.test(pageSrc)) failures.push(`${page.file} — ${query} failure must render retryable ListErrorBanner`);
      }
    }
  }
  return failures;
}

function selftest() {
  const goodHook = `export function useUrlSort() { useSearchParams(); }`;
  const goodCustomer = `
    import { useUrlSort } from "../hooks/useUrlSort";
    useUrlSort({ key: "load_sort", dir: "load_dir" });
    useUrlSort({ key: "contact_sort", dir: "contact_dir" });
    useUrlSort({ key: "pay_sort", dir: "pay_dir" });
    useUrlSort({ key: "lane_sort", dir: "lane_dir" });
    useUrlSort({ key: "invoice_sort", dir: "invoice_dir" });
    { key: "load_number", label: "Load #", sortable: true }
    { key: "name", label: "Name", sortable: true }
    { key: "date", label: "Date", sortable: true }
    { key: "lane_label", label: "Lane", sortable: true }
    <ParityTable sortKey={loadSortKey} sortDirection={loadSortDirection} onSortChange={onLoadSortChange} />
    <ParityTable sortKey={contactSortKey} sortDirection={contactSortDirection} onSortChange={onContactSortChange} />
    <ParityTable sortKey={paySortKey} sortDirection={paySortDirection} onSortChange={onPaySortChange} />
    <ParityTable sortKey={laneSortKey} sortDirection={laneSortDirection} onSortChange={onLaneSortChange} />
    <ParityTable sortKey={invoiceSortKey} sortDirection={invoiceSortDirection} onSortChange={onInvoiceSortChange} />
  `;
  const goodVendor = `
    import { useUrlSort } from "../hooks/useUrlSort";
    useUrlSort({ key: "pay_sort", dir: "pay_dir" });
    useUrlSort({ key: "bill_sort", dir: "bill_dir" });
    { key: "payment_date", label: "Date", sortable: true }
    { key: "bill_number", label: "Bill #", sortable: true }
    <ParityTable sortKey={paySortKey} sortDirection={paySortDirection} onSortChange={onPaySortChange} />
    <ParityTable sortKey={billSortKey} sortDirection={billSortDirection} onSortChange={onBillSortChange} />
    {vendorQuery.isError ? <ListErrorBanner onRetry={() => void vendorQuery.refetch()} /> : null}
    {billsQuery.isError ? <ListErrorBanner onRetry={() => void billsQuery.refetch()} /> : null}
    {vendorExpensesQuery.isError ? <ListErrorBanner onRetry={() => void vendorExpensesQuery.refetch()} /> : null}
    {vendorCreditsQuery.isError ? <ListErrorBanner onRetry={() => void vendorCreditsQuery.refetch()} /> : null}
  `;
  const pages = [
    {
      file: PAGES[0].file,
      label: PAGES[0].label,
      minSortedParityTables: 5,
      requiredPrefixes: PAGES[0].requiredPrefixes,
      pageSrc: goodCustomer,
    },
    {
      file: PAGES[1].file,
      label: PAGES[1].label,
      minSortedParityTables: 2,
      requiredPrefixes: PAGES[1].requiredPrefixes,
      pageSrc: goodVendor,
    },
  ];
  const good = { hookSrc: goodHook, pages };
  const planted = [
    [
      "no useUrlSort customer",
      {
        ...good,
        pages: [
          { ...pages[0], pageSrc: goodCustomer.replace(/useUrlSort/g, "noop") },
          pages[1],
        ],
      },
      "must call useUrlSort()",
    ],
    [
      "missing bill_sort prefix",
      {
        ...good,
        pages: [
          pages[0],
          {
            ...pages[1],
            pageSrc: goodVendor.replace('{ key: "bill_sort", dir: "bill_dir" }', '{ key: "sort", dir: "dir" }'),
          },
        ],
      },
      'useUrlSort({ key: "bill_sort", dir: "bill_dir" })',
    ],
    [
      "missing controlled sort vendor",
      {
        ...good,
        pages: [
          pages[0],
          {
            ...pages[1],
            pageSrc: goodVendor.replace("onSortChange={onBillSortChange}", ""),
          },
        ],
      },
      "sortKey/sortDirection/onSortChange",
    ],
    [
      "non-sortable data column",
      {
        ...good,
        pages: [
          {
            ...pages[0],
            pageSrc: goodCustomer.replace('"Load #", sortable: true', '"Load #"'),
          },
          pages[1],
        ],
      },
      "missing sortable: true",
    ],
    [
      "vendor credits retry removed",
      {
        ...good,
        pages: [
          pages[0],
          { ...pages[1], pageSrc: goodVendor.replace("vendorCreditsQuery.refetch()", "noop()") },
        ],
      },
      "vendorCreditsQuery failure must render retryable ListErrorBanner",
    ],
  ];
  const goodErrors = customerVendorDetailUrlSortErrors(good);
  const missed = planted.filter(([, fixture, needle]) =>
    !customerVendorDetailUrlSortErrors(fixture).some((f) => f.includes(needle)),
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

const failures = customerVendorDetailUrlSortErrors({
  hookSrc: readFile(HOOK_FILE),
  pages: PAGES.map((p) => ({
    ...p,
    pageSrc: readFile(p.file),
  })),
});
if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(
  `${LABEL} — OK (CustomerDetail 5 tables + VendorDetail 2 tables — URL sort via useUrlSort with distinct prefixes)`,
);
