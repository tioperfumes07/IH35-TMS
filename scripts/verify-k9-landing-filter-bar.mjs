#!/usr/bin/env node
// K.9 guard — Customers/Vendors landing filter bar with ≥5 visible filter controls.
//
// Both Customers.tsx and Vendors.tsx must keep their roster-level filters INLINE (visible on
// first load, 0 clicks) — not hidden behind a CollapsedListFilters popover. The guard counts
// the visible filter controls in the PageHeader actions area + NavyPageSubNav + sidebar search
// and fails if either page drops below 5 or regresses to CollapsedListFilters for roster filters.
//
// Usage: node scripts/verify-k9-landing-filter-bar.mjs
import { readFileSync } from "node:fs";

const CUSTOMERS_PATH = "apps/frontend/src/pages/Customers.tsx";
const VENDORS_PATH = "apps/frontend/src/pages/Vendors.tsx";
const MIN_CONTROLS = 5;

function countRosterSelectComboboxes(src) {
  // Count SelectCombobox usages with aria-label="Filter ... by ..." (roster filters, not txn).
  // The aria-label may be several lines below <SelectCombobox (arrow functions contain >), so
  // we match the aria-label directly — every "Filter <entity> by <field>" label is a roster filter.
  const matches = src.match(/aria-label="Filter [^"]+by [^"]+"/g) ?? [];
  return matches.length;
}

function hasInlineStatusFilter(src, entity) {
  return src.includes(`data-list-status-filter="${entity}"`);
}

function hasInlineToolbar(src, entity) {
  return src.includes(`data-${entity}-roster-filter-toolbar="inline"`);
}

function hasNavyPageSubNav(src) {
  return src.includes("NavyPageSubNav");
}

function hasSidebarSearch(src, entity) {
  // The sidebar search box lives in CustomerListSidebar / VendorListSidebar and is passed
  // onSearchChange or search/setSearch props. Check the page wires search state to the sidebar.
  return src.includes("onSearchChange") || src.includes(`search={search}`) || src.includes("setSearch");
}

function hasRosterCollapsedListFilters(src) {
  // CollapsedListFilters may legitimately appear for TRANSACTION filters (txnFilters), but
  // must NOT wrap the ROSTER filters. The roster filters use direct state (rosterCategory,
  // rosterVendorType, rosterType, rosterCreditStatus) — never staged via useStagedListFilters.
  // We check that the roster filter state variables are NOT passed into useStagedListFilters.
  const stagedBlock = src.match(/useStagedListFilters\(\{[\s\S]*?\}\)/);
  if (!stagedBlock) return false;
  const stagedText = stagedBlock[0];
  // Roster-only state names that must never appear inside useStagedListFilters.
  const rosterStateNames = ["rosterCategory", "rosterVendorType", "rosterType", "rosterCreditStatus"];
  return rosterStateNames.some((name) => stagedText.includes(name));
}

function hasK9Comment(src) {
  return src.includes("K.9");
}

function auditCustomers(src) {
  const f = [];
  const label = "Customers";

  if (!hasK9Comment(src))
    f.push(`${CUSTOMERS_PATH}: missing K.9 comment (roster filters inline marker)`);

  if (!hasInlineToolbar(src, "customers"))
    f.push(`${CUSTOMERS_PATH}: missing data-customers-roster-filter-toolbar="inline" (inline filter bar)`);

  if (!hasInlineStatusFilter(src, "customers"))
    f.push(`${CUSTOMERS_PATH}: missing data-list-status-filter="customers" (inline status toggle)`);

  if (!hasNavyPageSubNav(src))
    f.push(`${CUSTOMERS_PATH}: missing NavyPageSubNav (quality tabs)`);

  if (!hasSidebarSearch(src, "customers"))
    f.push(`${CUSTOMERS_PATH}: missing sidebar search wiring (onSearchChange / search)`);

  // Count visible filter controls:
  // 1. View mode toggle (ToolbarSegmentControl / data-view-mode-toggle)
  // 2. Inline status toggle (data-list-status-filter)
  // 3+4. SelectCombobox roster filters (Type + Credit status)
  // 5. NavyPageSubNav quality tabs
  // 6. Sidebar search
  let controls = 0;
  if (src.includes('data-view-mode-toggle="customers"') || src.includes('"data-view-mode-toggle": "customers"')) controls++;
  if (hasInlineStatusFilter(src, "customers")) controls++;
  controls += countRosterSelectComboboxes(src);
  if (hasNavyPageSubNav(src)) controls++;
  if (hasSidebarSearch(src, "customers")) controls++;

  if (controls < MIN_CONTROLS)
    f.push(`${CUSTOMERS_PATH}: only ${controls} visible filter controls (need ≥${MIN_CONTROLS})`);

  if (hasRosterCollapsedListFilters(src))
    f.push(`${CUSTOMERS_PATH}: roster filters must NOT be staged via useStagedListFilters (CollapsedListFilters is for transaction filters only)`);

  return { label, controls, failures: f };
}

function auditVendors(src) {
  const f = [];
  const label = "Vendors";

  if (!hasK9Comment(src))
    f.push(`${VENDORS_PATH}: missing K.9 comment (roster filters inline marker)`);

  if (!hasInlineToolbar(src, "vendors"))
    f.push(`${VENDORS_PATH}: missing data-vendors-roster-filter-toolbar="inline" (inline filter bar)`);

  if (!hasInlineStatusFilter(src, "vendors"))
    f.push(`${VENDORS_PATH}: missing data-list-status-filter="vendors" (inline status toggle)`);

  if (!hasNavyPageSubNav(src))
    f.push(`${VENDORS_PATH}: missing NavyPageSubNav (segment tabs)`);

  if (!hasSidebarSearch(src, "vendors"))
    f.push(`${VENDORS_PATH}: missing sidebar search wiring (onSearchChange / search)`);

  // Count visible filter controls:
  // 1. View mode toggle (data-view-mode-toggle)
  // 2. Inline status toggle (data-list-status-filter)
  // 3. Category filter (SelectCombobox aria-label="Filter vendors by category")
  // 4. Vendor Type filter (SelectCombobox aria-label="Filter vendors by type")
  // 5. NavyPageSubNav segment tabs
  // 6. Sidebar search
  let controls = 0;
  if (src.includes('data-view-mode-toggle="vendors"')) controls++;
  if (hasInlineStatusFilter(src, "vendors")) controls++;
  controls += countRosterSelectComboboxes(src);
  if (hasNavyPageSubNav(src)) controls++;
  if (hasSidebarSearch(src, "vendors")) controls++;

  if (controls < MIN_CONTROLS)
    f.push(`${VENDORS_PATH}: only ${controls} visible filter controls (need ≥${MIN_CONTROLS})`);

  if (hasRosterCollapsedListFilters(src))
    f.push(`${VENDORS_PATH}: roster filters must NOT be staged via useStagedListFilters (CollapsedListFilters is for transaction filters only)`);

  return { label, controls, failures: f };
}

function main() {
  const customersSrc = readFileSync(CUSTOMERS_PATH, "utf8");
  const vendorsSrc = readFileSync(VENDORS_PATH, "utf8");

  const results = [auditCustomers(customersSrc), auditVendors(vendorsSrc)];

  let allFailures = [];
  for (const r of results) {
    console.log(`\n[K.9] ${r.label}: ${r.controls} visible filter controls (min ${MIN_CONTROLS})`);
    if (r.failures.length === 0) {
      console.log(`  ✓ PASS`);
    } else {
      console.log(`  ✗ FAIL`);
      for (const fail of r.failures) console.log(`    - ${fail}`);
      allFailures = allFailures.concat(r.failures);
    }
  }

  if (allFailures.length > 0) {
    console.log(`\n[K.9] FAILED — ${allFailures.length} issue(s)`);
    process.exit(1);
  }
  console.log(`\n[K.9] PASS — both pages have ≥${MIN_CONTROLS} inline filter controls`);
  process.exit(0);
}

main();
