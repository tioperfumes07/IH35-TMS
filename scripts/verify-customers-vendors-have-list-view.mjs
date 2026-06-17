#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const REQUIRED = [
  {
    // ResizableTh OR the shared TableHeaderCell — both give a resizable tabular grid
    // (GLOBAL-TABLE-CONTROLS rollout replaced ResizableTh with TableHeaderCell).
    file: "apps/frontend/src/pages/customers/CustomersListView.tsx",
    markers: ["data-customers-list-view", "ResizableTh|TableHeaderCell", "BulkActionBar"],
  },
  {
    file: "apps/frontend/src/pages/vendors/VendorsListView.tsx",
    markers: ["data-vendors-list-view", "ResizableTh|TableHeaderCell", "BulkActionBar"],
  },
  {
    file: "apps/frontend/src/pages/Customers.tsx",
    markers: ["data-view-mode-toggle=\"customers\"", "CustomersListView", "useViewModePref"],
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
    const ok = marker.split("|").some((alt) => source.includes(alt));
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
