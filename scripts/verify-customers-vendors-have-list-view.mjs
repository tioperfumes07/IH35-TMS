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
    markers: ['data-view-mode-toggle=\"customers\"|\"data-view-mode-toggle\": \"customers\"', "CustomersListView", "useViewModePref"],
  },
  {
    file: "apps/frontend/src/pages/Vendors.tsx",
    markers: ["data-view-mode-toggle=\"vendors\"", "VendorsListView", "useViewModePref"],
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
  console.log(`[verify-customers-vendors-have-list-view] SELFTEST PASS (${cases.length}/${cases.length})`);
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
