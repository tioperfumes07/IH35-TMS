#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const REQUIRED_FILES = [
  {
    rel: "apps/frontend/src/components/forms/TwoSectionLineEditor.tsx",
    mustInclude: ["useAccountingCategoriesQuery", "useAccountingItemsQuery", "categoryFetchActive"],
  },
  {
    rel: "apps/frontend/src/pages/maintenance/WorkOrderCreateModal.tsx",
    mustInclude: ["useAccountingCategoriesQuery", "SelectCombobox", "setCategoryFetchActive"],
  },
  {
    rel: "apps/frontend/src/components/accounting/VendorBillForm.tsx",
    mustInclude: ['mode="bill"', "TwoSectionLineEditor"],
  },
  {
    rel: "apps/frontend/src/hooks/useAccountingCategoriesQuery.ts",
    mustInclude: ["/api/v1/accounting/categories"],
  },
  {
    rel: "apps/frontend/src/hooks/useAccountingItemsQuery.ts",
    mustInclude: ["/api/v1/accounting/items-for-wo"],
  },
];

const failures = [];

for (const entry of REQUIRED_FILES) {
  const full = path.join(repoRoot, entry.rel);
  if (!fs.existsSync(full)) {
    failures.push(`${entry.rel} (missing)`);
    continue;
  }
  const source = fs.readFileSync(full, "utf8");
  for (const needle of entry.mustInclude) {
    if (!source.includes(needle)) {
      failures.push(`${entry.rel} (missing "${needle}")`);
    }
  }
}

if (failures.length > 0) {
  console.error("[verify-wo-category-actually-fetches] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log(`[verify-wo-category-actually-fetches] OK (${REQUIRED_FILES.length} surfaces wired)`);
