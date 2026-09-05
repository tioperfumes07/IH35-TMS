#!/usr/bin/env node
/**
 * verify-planners-lists-parity.mjs
 * Wave 3 Step 2 guard — asserts planner + dispatch catalog list parity:
 *
 *  1. DispatchPlannersLayout.tsx has defaultOpen={true} on its CollapsedListFilters
 *     (via UniversalFilterBar defaultOpen prop — K.9 pattern, 0 clicks).
 *  2. DispatchPlannersLayout.tsx has a Print button (window.print) and CSV export.
 *  3. Scans all .tsx files under apps/frontend/src/pages/lists/dispatch/**
 *  4. For each, checks: sortable columns, voided/inactive toggle, CSV export, Print button.
 *  5. Exits 0 if all pass, 1 otherwise.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PLANNERS_LAYOUT = path.join(
  ROOT,
  "apps/frontend/src/pages/dispatch/planners/DispatchPlannersLayout.tsx"
);
const LISTS_DISPATCH_DIR = path.join(
  ROOT,
  "apps/frontend/src/pages/lists/dispatch"
);

const failures = [];
const passes = [];

function check(condition, label) {
  if (condition) {
    passes.push(label);
  } else {
    failures.push(label);
  }
}

// ---------------------------------------------------------------------------
// 1 + 2. DispatchPlannersLayout.tsx — defaultOpen, Print, CSV
// ---------------------------------------------------------------------------
if (!fs.existsSync(PLANNERS_LAYOUT)) {
  failures.push(`DispatchPlannersLayout.tsx not found at ${PLANNERS_LAYOUT}`);
} else {
  const layoutSrc = fs.readFileSync(PLANNERS_LAYOUT, "utf8");

  // A1: defaultOpen={true} — either on CollapsedListFilters directly or via UniversalFilterBar
  check(
    /defaultOpen=\{true\}/.test(layoutSrc),
    "DispatchPlannersLayout: defaultOpen={true} present (K.9 0-click filter bar)"
  );

  // A2: Print button (window.print)
  check(
    /window\.print\(\)/.test(layoutSrc),
    "DispatchPlannersLayout: Print button (window.print) present"
  );

  // A2: CSV export — Blob download or exportPlannerCsv function
  check(
    /exportPlannerCsv|Export CSV/.test(layoutSrc),
    "DispatchPlannersLayout: CSV export present"
  );
}

// ---------------------------------------------------------------------------
// 3 + 4. Scan all .tsx files under pages/lists/dispatch/**
// ---------------------------------------------------------------------------
function collectTsxFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsxFiles(fullPath));
    } else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
      results.push(fullPath);
    }
  }
  return results;
}

const tsxFiles = collectTsxFiles(LISTS_DISPATCH_DIR);

if (tsxFiles.length === 0) {
  failures.push("No .tsx files found under apps/frontend/src/pages/lists/dispatch/**");
}

for (const file of tsxFiles) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, "utf8");

  // Skip modals and test files — they are not list pages.
  if (/Modal/i.test(rel) || /\.test\./.test(rel)) continue;

  // --- Delegation: thin wrapper pages that render <DispatchCatalogListPage> or
  // <CatalogTable> inherit sortable/showInactive/CSV from those shared components.
  // DispatchCatalogListPage.tsx itself is checked directly; wrappers delegate to it.
  const delegatesToDispatchCatalog = /<DispatchCatalogListPage/.test(src) && rel !== "apps/frontend/src/pages/lists/dispatch/DispatchCatalogListPage.tsx";
  const delegatesToCatalogTable = /<CatalogTable/.test(src);

  // --- Sortable columns ---
  if (delegatesToDispatchCatalog || delegatesToCatalogTable) {
    check(true, `${rel}: sortable columns present (via shared component)`);
  } else {
    const hasSortable =
      /sortable:\s*true/.test(src) || /sortable:\s*column\.sortable\s*!==\s*false/.test(src);
    check(hasSortable, `${rel}: sortable columns present`);
  }

  // --- Voided/inactive toggle ---
  if (delegatesToDispatchCatalog || delegatesToCatalogTable) {
    check(true, `${rel}: voided/inactive toggle present (via shared component)`);
  } else {
    const hasInactiveToggle =
      /showInactive|showVoided/.test(src) && /type="checkbox"/.test(src);
    check(hasInactiveToggle, `${rel}: voided/inactive toggle (showInactive/showVoided + checkbox) present`);
  }

  // --- CSV export ---
  if (delegatesToDispatchCatalog || delegatesToCatalogTable) {
    check(true, `${rel}: CSV export present (via shared component)`);
  } else {
    const hasCsvExport =
      /exportFilename/.test(src) ||
      /exportCsv|exportCSV|Export CSV/.test(src);
    check(hasCsvExport, `${rel}: CSV export (exportFilename or Export CSV button) present`);
  }

  // --- Print button ---
  // Print is page-level (window.print). Wrapper pages that render <DispatchCatalogListPage>
  // inherit the Print button from that shared component.
  if (delegatesToDispatchCatalog) {
    check(true, `${rel}: Print button present (via shared component)`);
  } else {
    const hasPrint = /window\.print\(\)/.test(src);
    check(hasPrint, `${rel}: Print button (window.print) present`);
  }
}

// ---------------------------------------------------------------------------
// 5. Report
// ---------------------------------------------------------------------------
console.log(`\n=== verify-planners-lists-parity ===`);
console.log(`Passes: ${passes.length}`);
console.log(`Failures: ${failures.length}`);

if (failures.length > 0) {
  console.log("\nFAILURES:");
  for (const f of failures) {
    console.log(`  ✗ ${f}`);
  }
}

if (passes.length > 0) {
  console.log("\nPASSES:");
  for (const p of passes) {
    console.log(`  ✓ ${p}`);
  }
}

if (failures.length > 0) {
  console.log("\n❌ verify-planners-lists-parity FAILED");
  process.exit(1);
} else {
  console.log("\n✅ verify-planners-lists-parity PASSED");
  process.exit(0);
}
