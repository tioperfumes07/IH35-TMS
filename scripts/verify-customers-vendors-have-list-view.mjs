#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const REQUIRED = [
  {
    // ResizableTh OR the shared TableHeaderCell OR ParityTable — all give a resizable tabular grid.
    // (GLOBAL-TABLE-CONTROLS rollout replaced ResizableTh with TableHeaderCell; TBL-STANDARD batch 2
    // migrates customers to the shared ParityTable, which owns the resizable/table-fixed column grid.)
    file: "apps/frontend/src/pages/customers/CustomersListView.tsx",
    // Bulk actions must exist: the legacy <BulkActionBar> OR ParityTable's own `batchActions` toolbar
    // (selectable rows → batch bar) — the same feature via the shared component. Accept either so the
    // ParityTable migration keeps the AUDIT-FIX-3 bulk-select guarantee without a literal-name proxy.
    markers: ["data-customers-list-view", "ResizableTh|TableHeaderCell|ParityTable", "BulkActionBar|batchActions"],
  },
  {
    file: "apps/frontend/src/pages/vendors/VendorsListView.tsx",
    markers: ["data-vendors-list-view", "ResizableTh|TableHeaderCell|ParityTable", "BulkActionBar|batchActions"],
  },
  {
    file: "apps/frontend/src/pages/Customers.tsx",
    // ROUND 443.250 Customers home V3 — V3KpiTile strip (With transactions / In the book /
    // Open invoices / Billed / A/R open / Collected) marked data-customers-v3-kpis.
    markers: [
      'data-view-mode-toggle=\"customers\"|\"data-view-mode-toggle\": \"customers\"',
      "CustomersListView",
      "useViewModePref",
      "V3KpiTile",
      'data-customers-v3-kpis',
    ],
  },
  {
    // Same two spellings the customers entry above already accepts. Vendors.tsx made the identical
    // shared-control migration (the toggle now ships its data attribute through `dataAttributes`,
    // Vendors.tsx:614) but this entry was never widened with it, so pass-7 AUDIT-FIX-3 went red on
    // main against a feature that is present and working. The guard was stale, not the page.
    // ROUND 443.250 Vendors home V3 — V3KpiTile strip (With transactions / In the book /
    // Open bills / Spend YTD) marked data-vendors-v3-kpis.
    file: "apps/frontend/src/pages/Vendors.tsx",
    markers: [
      'data-view-mode-toggle=\"vendors\"|"data-view-mode-toggle": "vendors"',
      "VendorsListView",
      "useViewModePref",
      "V3KpiTile",
      "data-vendors-v3-kpis",
    ],
  },
  {
    file: "apps/frontend/src/hooks/useViewModePref.ts",
    markers: ["EntityViewMode", "list", "master-detail"],
  },
];

function hasMarker(source, marker) {
  return marker.split("|").some((alternative) => source.includes(alternative));
}

if (process.argv.includes("--selftest")) {
  const marker = 'data-view-mode-toggle=\"customers\"|\"data-view-mode-toggle\": \"customers\"';
  const cases = [
    ["direct DOM attribute passes", '<div data-view-mode-toggle="customers" />', true],
    ["shared component dataAttributes passes", 'dataAttributes={{ "data-view-mode-toggle": "customers" }}', true],
    ["vendor value does not satisfy customers", 'dataAttributes={{ "data-view-mode-toggle": "vendors" }}', false],
    ["commentary without the contract fails", "customers view mode", false],
  ];
  for (const [name, source, expected] of cases) {
    if (hasMarker(source, marker) !== expected) {
      console.error(`[verify-customers-vendors-have-list-view] SELFTEST FAIL: ${name}`);
      process.exit(1);
    }
  }
  // ROUND 443.250 — V3 strip markers must be required on Customers.tsx + Vendors.tsx entries.
  const customersEntry = REQUIRED.find((r) => r.file.endsWith("Customers.tsx"));
  if (!customersEntry?.markers.includes("V3KpiTile") || !customersEntry.markers.includes("data-customers-v3-kpis")) {
    console.error("[verify-customers-vendors-have-list-view] SELFTEST FAIL: Customers.tsx must require V3KpiTile + data-customers-v3-kpis");
    process.exit(1);
  }
  const vendorsEntry = REQUIRED.find((r) => r.file.endsWith("Vendors.tsx"));
  if (!vendorsEntry?.markers.includes("V3KpiTile") || !vendorsEntry.markers.includes("data-vendors-v3-kpis")) {
    console.error("[verify-customers-vendors-have-list-view] SELFTEST FAIL: Vendors.tsx must require V3KpiTile + data-vendors-v3-kpis");
    process.exit(1);
  }
  const v3GoodCustomers =
    'import { V3KpiTile } from "../components/v3/V3KpiTile";\ndata-customers-v3-kpis="1"\nCustomersListView\nuseViewModePref\ndata-view-mode-toggle="customers"';
  for (const m of customersEntry.markers) {
    if (!hasMarker(v3GoodCustomers, m)) {
      console.error(`[verify-customers-vendors-have-list-view] SELFTEST FAIL: customers good fixture missing ${m}`);
      process.exit(1);
    }
  }
  const v3BadCustomers = v3GoodCustomers
    .replace(/V3KpiTile/g, "LegacyKpi")
    .replace(/data-customers-v3-kpis/g, "data-customers-legacy");
  if (hasMarker(v3BadCustomers, "V3KpiTile") || hasMarker(v3BadCustomers, "data-customers-v3-kpis")) {
    console.error("[verify-customers-vendors-have-list-view] SELFTEST FAIL: customers V3 strip removal should fail markers");
    process.exit(1);
  }
  const v3GoodVendors =
    'import { V3KpiTile } from "../components/v3/V3KpiTile";\ndata-vendors-v3-kpis="1"\nVendorsListView\nuseViewModePref\ndata-view-mode-toggle="vendors"';
  for (const m of vendorsEntry.markers) {
    if (!hasMarker(v3GoodVendors, m)) {
      console.error(`[verify-customers-vendors-have-list-view] SELFTEST FAIL: vendors good fixture missing ${m}`);
      process.exit(1);
    }
  }
  const v3BadVendors = v3GoodVendors
    .replace(/V3KpiTile/g, "LegacyKpi")
    .replace(/data-vendors-v3-kpis/g, "data-vendors-legacy");
  if (hasMarker(v3BadVendors, "V3KpiTile") || hasMarker(v3BadVendors, "data-vendors-v3-kpis")) {
    console.error("[verify-customers-vendors-have-list-view] SELFTEST FAIL: vendors V3 strip removal should fail markers");
    process.exit(1);
  }
  console.log(`[verify-customers-vendors-have-list-view] SELFTEST PASS (${cases.length}/${cases.length} + V3 customers + V3 vendors)`);
  process.exit(0);
}

const failures = [];

for (const req of REQUIRED) {
  const full = path.join(repoRoot, req.file);
  if (!fs.existsSync(full)) {
    failures.push(`${req.file} (missing)`);
    continue;
  }
  const source = fs.readFileSync(full, "utf8");
  for (const marker of req.markers) {
    // A marker may list alternatives separated by "|" (any-of). Accept if any present.
    const ok = hasMarker(source, marker);
    if (!ok) {
      failures.push(`${req.file} (missing marker: ${marker})`);
    }
  }
}

if (failures.length > 0) {
  console.error("[verify-customers-vendors-have-list-view] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log(`[verify-customers-vendors-have-list-view] OK (${REQUIRED.length} surfaces)`);
