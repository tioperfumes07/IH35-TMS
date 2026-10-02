#!/usr/bin/env node
/**
 * ROUND 296 item 3 — the 18 CC-3 filter surfaces. DONE means: house toolbar (UniversalListToolbar) with real declared
 * columns, "N of M" shown, the toolbar filtering the FULL set (server-side wherever the list is paged or capped), and
 * every filter column backed by a real indexed DB column.
 * This guard locks each surface as it is closed. FAILS IF a closed surface hands its toolbar a single page again
 * (search on page 1 cannot find a row on page 3; "N of M" counts one page).
 * Run: node scripts/verify-filter-surfaces-full-set.mjs [--selftest]
 */
import { readFileSync } from "node:fs";

const SURFACES = [
  {
    name: "Chart of Accounts",
    file: "apps/frontend/src/pages/lists/accounting/ChartOfAccountsListPage.tsx",
    must: [/<ListView[\s\S]{0,120}rows=\{filteredRows\}/, /const pagination = \{\s*\n?\s*clientSide: true,/, /async function fetchAllCatalogRows\(/, /\} while \(rows\.length < total\);/],
    mustNot: [/rows=\{pageRows\}/],
  },
  {
    name: "ListView pages after the toolbar",
    file: "apps/frontend/src/components/lists/ListView/ListView.tsx",
    must: [/result = applyUniversalListFilters\(result, toolbarSearch, toolbarRange\);/, /return processedRows\.slice\(start, start \+ pagination\.pageSize\);/, /\{pageRows\.map\(\(row\) => \{/, /resultCount=\{processedRows\.length\}/],
    mustNot: [/\{processedRows\.map\(\(row\) => \{/],
  },
];

export function audit(read) {
  const fails = [];
  for (const s of SURFACES) {
    const src = read(s.file);
    for (const re of s.must) if (!re.test(src)) fails.push(`${s.name}: missing ${re}`);
    for (const re of s.mustNot ?? []) if (re.test(src)) fails.push(`${s.name}: regressed ${re}`);
  }
  return fails;
}

const read = (f) => readFileSync(f, "utf8");
const fails = audit(read);
if (fails.length) { console.error(`verify-filter-surfaces-full-set: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["CoA back to one page", (f) => f.endsWith("ChartOfAccountsListPage.tsx") ? read(f).replace("rows={filteredRows}", "rows={pageRows}") : read(f)],
    ["ListView renders unpaged", (f) => f.endsWith("ListView.tsx") ? read(f).replace("{pageRows.map((row) => {", "{processedRows.map((row) => {") : read(f)],
  ];
  for (const [name, r] of mutations) if (audit(r).length === 0) { console.error(`selftest FAIL: ${name}`); process.exit(1); }
  console.log(`verify-filter-surfaces-full-set selftest ${mutations.length}/${mutations.length} caught`);
}
console.log(`verify-filter-surfaces-full-set: OK — ${SURFACES.length} surface contract(s) hold`);
