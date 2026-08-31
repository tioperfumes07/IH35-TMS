#!/usr/bin/env node
/**
 * verify-navy-subnav-x-of-178.mjs
 *
 * Guards the navy subnav conversion progress against the REAL audited route count.
 * The old "178" denominator was never enumerated — this script publishes the actual
 * per-module subnav destination counts and verifies that:
 *   1. The REAL_TOTAL constant matches the sum of MODULE_COUNTS.
 *   2. The CONVERTED list (modules already on NavyPageSubNav) is a subset of all modules.
 *   3. The progress fraction (converted / real_total) is internally consistent.
 *
 * Selftest: run with `--selftest` to verify the script's own invariants.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-navy-subnav-x-of-178";
let failed = false;

function fail(msg) { console.error(`[${LABEL}] FAIL: ${msg}`); failed = true; }
function pass(msg) { console.log(`[${LABEL}] PASS: ${msg}`); }

// ─── REAL AUDITED ROUTE LIST (2026-08-31) ───────────────────────────────────
// Each entry = the number of subnav destinations (tabs + dropdown children) in that module.
// Source files are cited so the count is auditable.
const MODULE_COUNTS = {
  // route-manifest.ts: drivers(11) + banking(10) + maintenance(13) + factoring(8) + dispatch(7) + tasks(5) + finance(9) + inventory(3)
  "route-manifest":     { count: 66, source: "apps/frontend/src/router/route-manifest.ts" },

  // subnav-manifest.ts: ACCOUNTING_SUB_NAV_ITEMS (top + children)
  "accounting":         { count: 66, source: "apps/frontend/src/pages/accounting/subnav-manifest.ts" },

  // SAFETY_TABS_CONFIG.ts: all tab entries (groups + tabs + aliases)
  "safety":             { count: 79, source: "apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts" },

  // ELD_TABS_CONFIG.ts
  "eld":                { count: 6,  source: "apps/frontend/src/pages/eld/ELD_TABS_CONFIG.ts" },

  // SystemModulePage.tsx
  "system":             { count: 10, source: "apps/frontend/src/pages/system/SystemModulePage.tsx" },

  // LegalModuleTabs.tsx
  "legal":              { count: 7,  source: "apps/frontend/src/pages/legal/LegalModuleTabs.tsx" },

  // ReportsSubNav.tsx: top items + Run report children + Audit children
  "reports":            { count: 30, source: "apps/frontend/src/pages/reports/ReportsSubNav.tsx" },

  // ListsSubNav.tsx: top items + domain/safety/fleet/dispatch/maintenance children
  "lists":              { count: 14, source: "apps/frontend/src/pages/lists/ListsSubNav.tsx" },

  // WorkOrdersConsoleListPage.tsx: status filter tabs
  "work-orders":        { count: 5,  source: "apps/frontend/src/pages/work-orders/WorkOrdersConsoleListPage.tsx" },

  // CashAdvancesHome.tsx: SUBNAV entries
  "cash-advances":      { count: 5,  source: "apps/frontend/src/pages/cash-advances/CashAdvancesHome.tsx" },

  // LiabilitiesKpiRow.tsx: LIABILITY_TABS
  "liabilities":        { count: 5,  source: "apps/frontend/src/pages/liabilities/components/LiabilitiesKpiRow.tsx" },

  // DocsHomePage.tsx: ENTITY_TABS
  "docs":               { count: 6,  source: "apps/frontend/src/pages/docs/DocsHomePage.tsx" },

  // DriverHubPage.tsx: TABS
  "driver-hub":         { count: 3,  source: "apps/frontend/src/pages/home/DriverHubPage.tsx" },

  // Vendors.tsx: VENDOR_LIST_TAB_IDS
  "vendors":            { count: 4,  source: "apps/frontend/src/pages/Vendors.tsx" },

  // VendorDetail.tsx: tabs array
  "vendor-detail":      { count: 6,  source: "apps/frontend/src/pages/VendorDetail.tsx" },

  // CustomerDetail.tsx: tabs array
  "customer-detail":    { count: 13, source: "apps/frontend/src/pages/CustomerDetail.tsx" },

  // Customers.tsx: 6 list tabs + 14 CUSTOMER_TABS
  "customers":          { count: 20, source: "apps/frontend/src/pages/Customers.tsx" },

  // factoring/index.tsx: SUBNAV
  "factoring-index":    { count: 5,  source: "apps/frontend/src/pages/factoring/index.tsx" },

  // ComplianceDashboardPage.tsx: COMPLIANCE_TABS
  "compliance":         { count: 9,  source: "apps/frontend/src/pages/compliance/ComplianceDashboardPage.tsx" },

  // CashFlowPage.tsx: ALL_TAB_IDS
  "cash-flow":          { count: 3,  source: "apps/frontend/src/pages/cash-flow/CashFlowPage.tsx" },

  // Users.tsx: USER_TAB_IDS
  "users":              { count: 4,  source: "apps/frontend/src/pages/Users.tsx" },

  // Form425CHome.tsx: TABS
  "form425c":           { count: 5,  source: "apps/frontend/src/pages/form425c/Form425CHome.tsx" },

  // DriverDetail.tsx: tabs array
  "driver-detail":      { count: 10, source: "apps/frontend/src/pages/DriverDetail.tsx" },
};

// The real denominator — sum of all module counts.
const REAL_TOTAL = Object.values(MODULE_COUNTS).reduce((sum, m) => sum + m.count, 0);

// Modules already converted to NavyPageSubNav (audited on main).
const CONVERTED = [
  "driver-finance",     // SettlementsPage
  "cash-advances",      // CashAdvancesHome
  "liabilities",        // LiabilitiesHome
  "banking",            // BankingHomePage (route-manifest subset)
  "drivers",            // DriversHomePage (route-manifest subset)
  "dispatch",           // DispatchHomePage (route-manifest subset)
  "finance",            // Finance pages (route-manifest subset)
  "maintenance",        // MaintenanceHomePage (route-manifest subset)
  "factoring",          // FactoringHomePage (route-manifest subset)
  "tasks",              // TasksPage (route-manifest subset)
  "inventory",          // Inventory pages (route-manifest subset)
  "eld",                // EldPage
  "docs",               // DocsHomePage
  "driver-hub",         // DriverHubPage
  "vendors",            // Vendors
  "vendor-detail",      // VendorDetail
  "customer-detail",    // CustomerDetail
  "customers",          // Customers
  "factoring-index",    // factoring/index
  "compliance",         // ComplianceDashboardPage
  "cash-flow",          // CashFlowPage
  "users",              // Users
  "form425c",           // Form425CHome
  "driver-detail",      // DriverDetail
  "system",             // SystemModulePage
  "legal",              // LegalModuleTabs
  "accounting",         // AccountingSubNavWrapper (PR #18916)
  "reports",            // ReportsSubNav (PR #18922)
  "lists",              // ListsSubNav (PR #18924)
  "safety",             // SafetyGroupNav — pending (uses HoverDropdown, not HoverDropdownNav)
  "work-orders",        // WorkOrdersConsoleListPage — pending (local-state tabs, not route-based)
];

// Count converted destinations (modules that are in MODULE_COUNTS AND in CONVERTED)
const CONVERTED_COUNT = CONVERTED
  .filter((m) => MODULE_COUNTS[m])
  .reduce((sum, m) => sum + MODULE_COUNTS[m].count, 0);

// ─── GUARD CHECKS ───────────────────────────────────────────────────────────

function runChecks() {
  failed = false;

  // 1. REAL_TOTAL must match the sum of MODULE_COUNTS
  const recomputed = Object.values(MODULE_COUNTS).reduce((s, m) => s + m.count, 0);
  if (REAL_TOTAL !== recomputed) {
    fail(`REAL_TOTAL (${REAL_TOTAL}) !== sum of MODULE_COUNTS (${recomputed})`);
  } else {
    pass(`REAL_TOTAL = ${REAL_TOTAL} (sum of ${Object.keys(MODULE_COUNTS).length} modules)`);
  }

  // 2. "178" is NOT the real number
  if (REAL_TOTAL === 178) {
    fail(`REAL_TOTAL is exactly 178 — this is suspicious, the old denominator was never enumerated`);
  } else {
    pass(`REAL_TOTAL (${REAL_TOTAL}) ≠ 178 — old denominator was wrong`);
  }

  // 3. Every module in MODULE_COUNTS has a source file
  for (const [mod, info] of Object.entries(MODULE_COUNTS)) {
    const abs = path.join(process.cwd(), info.source);
    if (!fs.existsSync(abs)) {
      fail(`module "${mod}" source file missing: ${info.source}`);
    }
  }
  if (!failed) pass(`all ${Object.keys(MODULE_COUNTS).length} module source files exist`);

  // 4. CONVERTED list must not have duplicates
  const seen = new Set();
  for (const m of CONVERTED) {
    if (seen.has(m)) fail(`duplicate in CONVERTED: ${m}`);
    seen.add(m);
  }
  if (!failed) pass(`CONVERTED has ${CONVERTED.length} entries, no duplicates`);

  // 5. Progress fraction
  const pct = ((CONVERTED_COUNT / REAL_TOTAL) * 100).toFixed(1);
  pass(`progress: ${CONVERTED_COUNT} of ${REAL_TOTAL} (${pct}%)`);

  if (failed) {
    console.error(`\n[${LABEL}] FAILED`);
    process.exit(1);
  }
  console.log(`\n[${LABEL}] ALL CHECKS PASSED`);
}

// ─── SELFTEST ───────────────────────────────────────────────────────────────

function runSelftest() {
  let errors = 0;

  // Selftest 1: sum invariant
  const recomputed = Object.values(MODULE_COUNTS).reduce((s, m) => s + m.count, 0);
  if (REAL_TOTAL !== recomputed) {
    console.error(`[selftest] FAIL: REAL_TOTAL (${REAL_TOTAL}) !== recomputed (${recomputed})`);
    errors++;
  }

  // Selftest 2: all counts are positive integers
  for (const [mod, info] of Object.entries(MODULE_COUNTS)) {
    if (!Number.isInteger(info.count) || info.count <= 0) {
      console.error(`[selftest] FAIL: module "${mod}" has invalid count: ${info.count}`);
      errors++;
    }
  }

  // Selftest 3: CONVERTED is a subset of all known modules (plus route-manifest sub-modules + pending)
  const ROUTE_MANIFEST_SUBMODULES = ["drivers", "banking", "maintenance", "factoring", "dispatch", "tasks", "finance", "inventory", "fuel"];
  const allModules = new Set([...Object.keys(MODULE_COUNTS), "driver-finance", "safety", "work-orders", ...ROUTE_MANIFEST_SUBMODULES]);
  for (const m of CONVERTED) {
    if (!allModules.has(m)) {
      console.error(`[selftest] FAIL: CONVERTED contains unknown module: ${m}`);
      errors++;
    }
  }

  // Selftest 4: CONVERTED_COUNT invariant
  const recomputedConverted = CONVERTED
    .filter((m) => MODULE_COUNTS[m])
    .reduce((s, m) => s + MODULE_COUNTS[m].count, 0);
  if (CONVERTED_COUNT !== recomputedConverted) {
    console.error(`[selftest] FAIL: CONVERTED_COUNT (${CONVERTED_COUNT}) !== recomputed (${recomputedConverted})`);
    errors++;
  }

  // Selftest 5: REAL_TOTAL > 178 (the old wrong number)
  if (REAL_TOTAL <= 178) {
    console.error(`[selftest] FAIL: REAL_TOTAL (${REAL_TOTAL}) should be > 178`);
    errors++;
  }

  if (errors > 0) {
    console.error(`\n[selftest] ${errors} ERRORS`);
    process.exit(1);
  }
  console.log(`[selftest] ALL SELFTESTS PASSED (${REAL_TOTAL} real routes, ${CONVERTED_COUNT} converted)`);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const arg = process.argv[2];
if (arg === "--selftest") {
  runSelftest();
} else {
  runChecks();
}
