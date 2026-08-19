#!/usr/bin/env node
/**
 * Cursor vertical — Lists catalog qbo_chrome + picker_law (Box3 Built).
 * HONEST-BUILT-LAUNCH-LAW: leaf-specific tags only; picker_law claims ≤40 Required leaves each.
 *
 * @matrix-built {"modules":["lists"],"cols":["qbo_chrome"],"leafRe":"^catalog\\.","task":"CURSOR-VERTICAL-LISTS-CATALOG-QBO","vertical":"column-wave"}
 * @matrix-built {"modules":["lists"],"cols":["picker_law"],"leafRe":"^catalog\\.fleet\\.","task":"CURSOR-VERTICAL-LISTS-PICKER-fleet","vertical":"column-wave"}
 * @matrix-built {"modules":["lists"],"cols":["picker_law"],"leafRe":"^catalog\\.fuel\\.","task":"CURSOR-VERTICAL-LISTS-PICKER-fuel","vertical":"column-wave"}
 * @matrix-built {"modules":["lists"],"cols":["picker_law"],"leafRe":"^catalog\\.drivers\\.","task":"CURSOR-VERTICAL-LISTS-PICKER-drivers","vertical":"column-wave"}
 * @matrix-built {"modules":["lists"],"cols":["picker_law"],"leafRe":"^catalog\\.safety\\.","task":"CURSOR-VERTICAL-LISTS-PICKER-safety","vertical":"column-wave"}
 * @matrix-built {"modules":["lists"],"cols":["picker_law"],"leafRe":"^catalog\\.dispatch\\.","task":"CURSOR-VERTICAL-LISTS-PICKER-dispatch","vertical":"column-wave"}
 * @matrix-built {"modules":["lists"],"cols":["picker_law"],"leafRe":"^catalog\\.customers\\.","task":"CURSOR-VERTICAL-LISTS-PICKER-customers","vertical":"column-wave"}
 * @matrix-built {"modules":["lists"],"cols":["picker_law"],"leafRe":"^catalog\\.vendors\\.","task":"CURSOR-VERTICAL-LISTS-PICKER-vendors","vertical":"column-wave"}
 * @matrix-built {"modules":["lists"],"cols":["picker_law"],"leafRe":"^catalog\\.maintenance\\.(labor_rates|part_locations|air_bag_catalog|battery_catalog|pm_intervals|repair_locations|tire_catalog|trailer_parts|truck_parts|work_order_templates)\\.","task":"CURSOR-VERTICAL-LISTS-PICKER-maintenance-a","vertical":"column-wave"}
 * @matrix-built {"modules":["lists"],"cols":["picker_law"],"leafRe":"^catalog\\.maintenance\\.(failure_codes|labor_codes|parts|parts_catalog|oem_parts_reference|priority_levels|service_tasks|services_catalog|shop_locations|vendors|work_order_statuses)\\.","task":"CURSOR-VERTICAL-LISTS-PICKER-maintenance-b","vertical":"column-wave"}
 * @matrix-built {"modules":["lists"],"cols":["picker_law"],"leafRe":"^catalog\\.accounting\\.(account_types_lookup|detail_types_lookup|audit_event_types|chart_of_accounts|account_types|detail_types|classes|payment_terms|posting_templates|journal_entry_types)\\.","task":"CURSOR-VERTICAL-LISTS-PICKER-accounting-a","vertical":"column-wave"}
 * @matrix-built {"modules":["lists"],"cols":["picker_law"],"leafRe":"^catalog\\.accounting\\.(qbo_bulk_link|qbo_categories|items|account_role_bindings|chart_of_accounts_seeds|expense_categories|payment_methods|tax_codes|currency_codes|void_cancel_reasons|abandonment_defaults)\\.","task":"CURSOR-VERTICAL-LISTS-PICKER-accounting-b","vertical":"column-wave"}
 * @matrix-built {"modules":["lists"],"cols":["picker_law"],"leafRe":"^(lists\\.(modal|drawer)\\.|catalogs\\.(equipment_types|driver_load_statuses)\\.create$)","task":"CURSOR-VERTICAL-LISTS-PICKER-modals","vertical":"column-wave"}
 * @matrix-built {"modules":["lists"],"cols":["qbo_chrome"],"leafRe":"^(lists\\.(modal|drawer|panel|dialog|popover)\\.|hub\\.home$|catalogs\\.(equipment_types|driver_load_statuses)\\.create$)","task":"CURSOR-VERTICAL-LISTS-QBO-modals","vertical":"column-wave"}
 *
 * Run: node scripts/verify-lists-catalog-chrome-picker-wave.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lists-catalog-chrome-picker-wave";

const SHARED_SHELLS = [
  "apps/frontend/src/pages/lists/GenericCatalogPage.tsx",
  "apps/frontend/src/components/catalogs/CatalogTable.tsx",
  "apps/frontend/src/pages/lists/fleet/FleetCatalogListPage.tsx",
  "apps/frontend/src/pages/lists/fuel/FuelCatalogListPage.tsx",
  "apps/frontend/src/pages/lists/maintenance/MaintenanceCatalogListPage.tsx",
  "apps/frontend/src/pages/lists/dispatch/DispatchCatalogListPage.tsx",
  "apps/frontend/src/pages/lists/accounting/AccountingCatalogListPage.tsx",
  "apps/frontend/src/pages/lists/driver/DriverCatalogListPage.tsx",
];

const SHELL_BASENAMES = new Set(
  SHARED_SHELLS.map((rel) => path.basename(rel, ".tsx")).concat(["GenericCatalogPage", "CatalogTable"]),
);

/** Search-only / create-elsewhere slices (not catalog +Create shells). */
const ALLOWED_NON_CREATE_LIST_PAGES = new Set([
  "apps/frontend/src/pages/lists/names/BrokersListPage.tsx", // customer_type=broker; create via customers
]);

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function walkListPages(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkListPages(abs, out);
    else if (/ListPage\.tsx$/.test(entry.name) && !entry.name.includes(".test.")) out.push(abs);
  }
  return out;
}

function hasSearchChrome(source) {
  return (
    /\bsetSearch\b/.test(source) ||
    /placeholder=["']Search/i.test(source) ||
    (/\bsearch\b/.test(source) && /onChange=/.test(source) && /input/i.test(source))
  );
}

function hasCreateChrome(source) {
  return source.includes("+ Create") || /\breadOnly\b/.test(source);
}

function importsKnownShell(source) {
  for (const name of SHELL_BASENAMES) {
    if (source.includes(name)) return true;
  }
  return false;
}

export function audit(opts = {}) {
  const failures = [];
  const generic = opts.genericSource ?? read("apps/frontend/src/pages/lists/GenericCatalogPage.tsx");
  const catalogTable = opts.catalogTableSource ?? read("apps/frontend/src/components/catalogs/CatalogTable.tsx");
  // LST-F3480 (cited in-code, CatalogTable.tsx): free-text search was consolidated onto the shared
  // ParityTable toolbar (`toolbarSearch`/`setToolbarSearch` there, feeding a real
  // applyUniversalListFilters call) — CatalogTable itself deliberately owns no page-local `setSearch`
  // state anymore. Re-checked here 2026-08-19: verify CatalogTable renders ParityTable without
  // suppressing its search (`suppressToolbarSearch`), and that ParityTable's own search state is real.
  const parityTable = opts.parityTableSource ?? read("apps/frontend/src/components/parity/ParityTable.tsx");

  if (!generic.includes("+ Create")) failures.push("GenericCatalogPage missing + Create");
  if (!generic.includes("CatalogEditModal")) failures.push("GenericCatalogPage missing CatalogEditModal");
  if (!generic.includes("CatalogTable")) failures.push("GenericCatalogPage missing CatalogTable");
  if (!catalogTable.includes("ParityTable")) failures.push("CatalogTable must use ParityTable");
  // LST-F3480: search moved off page-local state entirely — ParityTable's own toolbar owns it,
  // and CatalogTable.tsx never passes suppressToolbarSearch, so the shared component's default
  // (search enabled) applies. Accept either the older page-local setSearch state OR this
  // delegated-to-ParityTable shape (own the primitive, don't opt out of its search). This already
  // landed independently on main (converged with CC-2's own fix in a616eed3c) by the time of this
  // cherry-pick — kept HEAD's slightly more lenient, already-integrated version rather than
  // reintroducing a second, narrower check for the same invariant.
  const hasLocalSearchState = /\bsetSearch\b/.test(catalogTable);
  const delegatesSearchToParityTable =
    catalogTable.includes("ParityTable") && !/suppressToolbarSearch|hideSearch=\{?\s*true/.test(catalogTable);
  if (!hasLocalSearchState && !delegatesSearchToParityTable) failures.push("CatalogTable missing search state");
  if (!/\btoolbarSearch\b/.test(parityTable) || !/\bsetToolbarSearch\b/.test(parityTable)) {
    failures.push("ParityTable missing search state");
  }
  if (!/\bstatusFilter\b|\bsetStatus\b/.test(catalogTable)) failures.push("CatalogTable missing status filter");

  for (const rel of SHARED_SHELLS) {
    if (rel.endsWith("CatalogTable.tsx") || rel.endsWith("GenericCatalogPage.tsx")) continue;
    const src = opts.shellSources?.[rel] ?? read(rel);
    if (!hasCreateChrome(src)) failures.push(`${rel}: shared shell missing + Create / readOnly`);
    if (!hasSearchChrome(src)) failures.push(`${rel}: shared shell missing search chrome`);
  }

  const listRoot = path.join(ROOT, "apps/frontend/src/pages/lists");
  const pages = walkListPages(listRoot);
  if (pages.length < 40) failures.push(`ListPage inventory shrank to ${pages.length}`);

  for (const abs of pages) {
    const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
    if (ALLOWED_NON_CREATE_LIST_PAGES.has(rel)) {
      const src = opts.pageSources?.[rel] ?? fs.readFileSync(abs, "utf8");
      if (!hasSearchChrome(src)) failures.push(`${rel}: allowlisted slice must still keep search chrome`);
      continue;
    }
    const src = opts.pageSources?.[rel] ?? fs.readFileSync(abs, "utf8");
    if (hasCreateChrome(src) && hasSearchChrome(src)) continue;
    if (importsKnownShell(src)) continue;
    // Dedicated COA / class editors: still require + Create OR explicit read-only / redirect honesty
    if (hasCreateChrome(src) && (src.includes("Filter") || src.includes("search") || src.includes("Search"))) continue;
    if (src.includes("Navigate") && src.includes("replace")) continue;
    failures.push(`${rel}: ListPage lacks chrome and does not import a shared catalog shell`);
  }

  const required = JSON.parse(read("docs/specs/scoreboard/modules/lists.required.json"));
  const manifest = read("apps/frontend/src/routes/manifest.tsx");
  let catalogLeaves = 0;
  for (const leaf of required.leaves || []) {
    if (!String(leaf.id || "").startsWith("catalog.")) continue;
    const owes =
      Array.isArray(leaf.required) &&
      (leaf.required.includes("qbo_chrome") || leaf.required.includes("picker_law"));
    if (!owes) continue;
    catalogLeaves += 1;
    const hint = String(leaf.route_hint || "");
    if (!hint.startsWith("/lists/")) {
      failures.push(`${leaf.id}: route_hint must be under /lists/ (got ${hint || "empty"})`);
      continue;
    }
    // Dedicated path OR dynamic catch-all hosts generic catalogs
    const escaped = hint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const hasExact = new RegExp(`path="${escaped}"`).test(manifest) || manifest.includes(`path={'${hint}'}`);
    const hasCatchAll =
      manifest.includes('path="/lists/:domain/:catalogKey"') ||
      manifest.includes('path="/lists/catalogs/:domain/:catalogKey"');
    if (!hasExact && !hasCatchAll) {
      failures.push(`${leaf.id}: neither exact route nor lists catch-all in manifest`);
    }
  }
  if (catalogLeaves < 100) failures.push(`catalog chrome/picker leaf count shrank to ${catalogLeaves}`);

  // Modal / drawer / dialog surfaces for remaining Lists chrome leaves
  let surfaceLeaves = 0;
  for (const leaf of required.leaves || []) {
    const owes =
      Array.isArray(leaf.required) &&
      (leaf.required.includes("qbo_chrome") || leaf.required.includes("picker_law"));
    if (!owes) continue;
    const hint = String(leaf.route_hint || "");
    if (!hint.startsWith("surface://")) continue;
    surfaceLeaves += 1;
    const rel = hint.replace(/^surface:\/\//, "");
    const abs = path.join(ROOT, rel.startsWith("apps/") ? rel : path.join("apps/frontend/src", rel));
    // route_hint forms: surface://pages/... or surface://components/... or surface://apps/frontend/...
    const candidates = [
      abs,
      path.join(ROOT, "apps/frontend/src", rel),
      path.join(ROOT, rel),
    ];
    const hit = candidates.find((p) => fs.existsSync(p));
    if (!hit) {
      failures.push(`${leaf.id}: missing surface file for ${hint}`);
      continue;
    }
    const src = fs.readFileSync(hit, "utf8");
    const looksChrome =
      /\bopen\b/.test(src) ||
      /\bonClose\b/.test(src) ||
      /\bonOpenChange\b/.test(src) ||
      src.includes("+ Create") ||
      src.includes("ParityDrawer") ||
      src.includes("Dialog") ||
      src.includes("Modal") ||
      src.includes("Drawer") ||
      src.includes("Popover") ||
      (/Panel/.test(path.basename(hit)) && /export function|export const/.test(src) && /type Props/.test(src));
    if (!looksChrome) failures.push(`${leaf.id}: surface ${path.relative(ROOT, hit)} lacks modal/drawer chrome markers`);
  }
  if (surfaceLeaves < 15) failures.push(`lists surface:// chrome leaf count shrank to ${surfaceLeaves}`);

  return { failures, pages: pages.length, catalogLeaves, surfaceLeaves };
}

if (process.argv.includes("--selftest")) {
  const base = audit();
  if (base.failures.length) {
    console.error(`${LABEL} SELFTEST FAIL — clean tree already red:`);
    for (const f of base.failures) console.error(" -", f);
    process.exit(1);
  }
  const brokenGeneric = read("apps/frontend/src/pages/lists/GenericCatalogPage.tsx").replace("+ Create", "+ Add");
  const mut = audit({ genericSource: brokenGeneric });
  if (!mut.failures.some((f) => /GenericCatalogPage missing \+ Create/.test(f))) {
    console.error(`${LABEL} SELFTEST FAIL — + Create mutation not caught`);
    process.exit(1);
  }
  const brokenTable = read("apps/frontend/src/components/catalogs/CatalogTable.tsx").replaceAll(
    "ParityTable",
    "DataTable",
  );
  const mut2 = audit({ catalogTableSource: brokenTable });
  if (!mut2.failures.some((f) => /ParityTable/.test(f))) {
    console.error(`${LABEL} SELFTEST FAIL — ParityTable mutation not caught`);
    process.exit(1);
  }
  const suppressedTable = read("apps/frontend/src/components/catalogs/CatalogTable.tsx").replace(
    "<ParityTable<CatalogRow>",
    "<ParityTable<CatalogRow>\n        suppressToolbarSearch",
  );
  if (suppressedTable === read("apps/frontend/src/components/catalogs/CatalogTable.tsx")) {
    console.error(`${LABEL} SELFTEST FAIL — suppressToolbarSearch mutation anchor did not match, re-anchor`);
    process.exit(1);
  }
  const mut3 = audit({ catalogTableSource: suppressedTable });
  // Merged into the delegatesSearchToParityTable check (2026-08-19 consolidation) — a
  // suppressToolbarSearch tamper now fails as "CatalogTable missing search state" since neither
  // the local-state nor the delegated-search path is satisfied anymore.
  if (!mut3.failures.some((f) => /CatalogTable missing search state/.test(f))) {
    console.error(`${LABEL} SELFTEST FAIL — suppressToolbarSearch mutation not caught`);
    process.exit(1);
  }
  const brokenParity = read("apps/frontend/src/components/parity/ParityTable.tsx").replaceAll(
    "toolbarSearch",
    "toolbarQuery",
  );
  const mut4 = audit({ parityTableSource: brokenParity });
  if (!mut4.failures.some((f) => /ParityTable missing search state/.test(f))) {
    console.error(`${LABEL} SELFTEST FAIL — ParityTable search-state mutation not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const result = audit();
if (result.failures.length) {
  console.error(`${LABEL} FAIL (${result.failures.length}):`);
  for (const f of result.failures) console.error(" -", f);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — shells chrome-ok · ListPages=${result.pages} · catalogLeaves=${result.catalogLeaves} · surfaceLeaves=${result.surfaceLeaves}`,
);
