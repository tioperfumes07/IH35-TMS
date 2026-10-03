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
  // Full-load catalogs (route has no LIMIT; filter columns operating_company_id + is_active are indexed): ONE search =
  // the house toolbar over every row; one Show selector; no "Show inactive" double filter; no page-level search box.
  ...[
    ["Load Cancellation Reasons", "apps/frontend/src/pages/lists/dispatch/LoadCancellationReasonsListPage.tsx", /<DataTable\b/],
    ["Load Exception Reasons", "apps/frontend/src/pages/lists/dispatch/LoadExceptionReasonsListPage.tsx", /<ParityTable\b/],
    ["Driver Termination Reasons", "apps/frontend/src/pages/lists/drivers/TerminationReasonsListPage.tsx", /<DataTable\b/],
    ["Void / Cancel Reasons", "apps/frontend/src/pages/lists/accounting/VoidCancelReasonsListPage.tsx", /<DataTable\b/],
  ].map(([name, file, table]) => ({
    name,
    file,
    must: [table, /allRows\.filter\(\(row\) => status === "all" \|\| \(status === "active" \? row\.is_active : !row\.is_active\)\)/],
    mustNot: [/<CatalogListSearchInput\b/, /showInactive/, /suppressToolbarSearch/, /Total rows:/],
  })),
  // Capped routes (limit max 200): the page reads EVERY page through lib/fetchAllCatalogPages; status narrows
  // server-side on the indexed is_active; the house toolbar is the one search.
  ...[
    ["Fleet catalogs", "apps/frontend/src/pages/lists/fleet/FleetCatalogListPage.tsx"],
    ["Fuel catalogs", "apps/frontend/src/pages/lists/fuel/FuelCatalogListPage.tsx"],
    ["Maintenance catalogs", "apps/frontend/src/pages/lists/maintenance/MaintenanceCatalogListPage.tsx"],
  ].map(([name, file]) => ({
    name,
    file,
    must: [/fetchAllCatalogPages\(client\.list, \{ operating_company_id: companyId, is_active: status \}\)/, /<DataTable\b/],
    mustNot: [/<CatalogListSearchInput\b/, /showInactive/, /limit: 200, offset: 0/],
  })),
  {
    name: "Brokers",
    file: "apps/frontend/src/pages/lists/names/BrokersListPage.tsx",
    must: [/listAllCustomers\(\{[\s\S]{0,160}customer_type: "broker"/, /<DataTable\b/],
    mustNot: [/<CatalogListSearchInput\b/, /showInactive/, /search: search/],
  },
  {
    name: "Safety catalogs (8 lists, one generic page)",
    file: "apps/frontend/src/pages/lists/safety/SafetyGenericCatalogListPage.tsx",
    must: [/fetchAllCatalogPages\(client\.list, \{ operating_company_id: companyId, is_active: status \}\)/, /<ParityTable\b/],
    mustNot: [/<CatalogListSearchInput\b/, /showInactive/, /suppressToolbarSearch/, /limit: 200,\s*offset: 0/],
  },
  // Server-paged (route max 200): every filter runs on the server; the house toolbar's search drives `q`; "N of M" =
  // filtered total of library total; the table's own per-page toolbar is hidden (it could only see one page).
  {
    name: "All Documents (page)",
    file: "apps/frontend/src/pages/Documents.tsx",
    must: [/offset: \(page - 1\) \* PAGE_SIZE,\s*\.\.\.filters,/, /<UniversalListToolbar[\s\S]{0,400}resultCount=\{totalFiles\}\s*totalCount=\{libraryTotal\}/, /<DataTable\s+rows=\{files\}\s+hideToolbar/],
    mustNot: [/filteredFiles/, /original_filename\.toLowerCase\(\)\.includes/],
  },
  {
    name: "All Documents (route)",
    file: "apps/backend/src/docs/files.routes.ts",
    must: [/f\.original_filename ILIKE \$/, /f\.uploader_user_id = \$\$\{values\.length\}::uuid/, /COALESCE\(f\.document_date, f\.created_at::date\) >= /, /f\.expiration_date <= CURRENT_DATE \+ /, /NOT EXISTS \(SELECT 1 FROM docs\.file_links fl WHERE fl\.file_id = f\.id/, /library_total: response\.library_total/],
    mustNot: [],
  },
  {
    name: "Samsara driver mapping (page)",
    file: "apps/frontend/src/pages/samsara-driver-mapping/SamsaraDriverMappingPage.tsx",
    must: [/<UniversalListToolbar[\s\S]{0,500}resultCount=\{profilesQuery\.data\?\.total \?\? rows\.length\}/, /hideToolbar \/>/, /data-testid="profiles-prev-page"/],
    mustNot: [/onChange=\{\(e\) => \{\s*setSearch\(e\.target\.value\)/],
  },
  {
    name: "Samsara driver mapping (route)",
    file: "apps/backend/src/integrations/samsara/driver-mapping/driver-mapping.routes.ts",
    must: [/total: Number\(totalRes\.rows\[0\]\?\.n \?\? 0\)/, /scope_total: Number\(scopeRes\.rows\[0\]\?\.n \?\? 0\)/],
    mustNot: [],
  },
  {
    name: "Drivers roster",
    file: "apps/frontend/src/pages/Drivers.tsx",
    must: [/listAllDrivers\(\{[\s\S]{0,200}status: "All",/],
    mustNot: [/\[search,\s*setSearch\]/],
  },
];

export function audit(read) {
  const fails = [];
  for (const s of SURFACES) {
    const src = read(s.file);
    for (const re of s.must) if (!re.test(src)) fails.push(`${s.name}: missing ${re}`);
    for (const re of s.mustNot ?? []) if (re.test(src)) fails.push(`${s.name}: regressed ${re}`);
  }
  // BANK-F91100 — ORDERS chrome: Void/Cancel Reasons status pills use text-xs, not text-[11px].
  const voidRel = "apps/frontend/src/pages/lists/accounting/VoidCancelReasonsListPage.tsx";
  const voidSrc = read(voidRel);
  if (voidSrc.includes("text-[11px]")) {
    fails.push("Void / Cancel Reasons: must not use text-[11px] — use text-xs");
  }
  // BANK-F91107 — ORDERS chrome: Load Cancellation Reasons status pills use text-xs, not text-[11px].
  const cancelRel = "apps/frontend/src/pages/lists/dispatch/LoadCancellationReasonsListPage.tsx";
  const cancelSrc = read(cancelRel);
  if (cancelSrc.includes("text-[11px]")) {
    fails.push("Load Cancellation Reasons: must not use text-[11px] — use text-xs");
  }
  // BANK-F91108 — ORDERS chrome: Load Exception Reasons status pills use text-xs, not text-[11px].
  const exceptionRel = "apps/frontend/src/pages/lists/dispatch/LoadExceptionReasonsListPage.tsx";
  const exceptionSrc = read(exceptionRel);
  if (exceptionSrc.includes("text-[11px]")) {
    fails.push("Load Exception Reasons: must not use text-[11px] — use text-xs");
  }
  // BANK-F91109 — ORDERS chrome: Dispatch catalog status pills use text-xs, not text-[11px].
  const dispatchRel = "apps/frontend/src/pages/lists/dispatch/DispatchCatalogListPage.tsx";
  const dispatchSrc = read(dispatchRel);
  if (dispatchSrc.includes("text-[11px]")) {
    fails.push("Dispatch catalogs: must not use text-[11px] — use text-xs");
  }
  // BANK-F91110 — ORDERS chrome: Termination Reasons field errors use text-xs, not text-[11px].
  const termRel = "apps/frontend/src/pages/lists/drivers/TerminationReasonsListPage.tsx";
  const termSrc = read(termRel);
  if (termSrc.includes("text-[11px]")) {
    fails.push("Driver Termination Reasons: must not use text-[11px] — use text-xs");
  }
  return fails;
}

const read = (f) => readFileSync(f, "utf8");
const fails = audit(read);
if (fails.length) { console.error(`verify-filter-surfaces-full-set: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["CoA back to one page", (f) => f.endsWith("ChartOfAccountsListPage.tsx") ? read(f).replace("rows={filteredRows}", "rows={pageRows}") : read(f)],
    ["catalog page search comes back", (f) => f.endsWith("TerminationReasonsListPage.tsx") ? read(f) + "\n<CatalogListSearchInput value={x} />" : read(f)],
    ["Documents filters one page again", (f) => f.endsWith("Documents.tsx") ? read(f).replace("...filters,", "") : read(f)],
    ["ListView renders unpaged", (f) => f.endsWith("ListView.tsx") ? read(f).replace("{pageRows.map((row) => {", "{processedRows.map((row) => {") : read(f)],
  ];
  for (const [name, r] of mutations) if (audit(r).length === 0) { console.error(`selftest FAIL: ${name}`); process.exit(1); }
  console.log(`verify-filter-surfaces-full-set selftest ${mutations.length}/${mutations.length} caught`);
}
console.log(`verify-filter-surfaces-full-set: OK — ${SURFACES.length} surface contract(s) hold`);
