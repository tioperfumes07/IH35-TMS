#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const DETAIL_SURFACES = [
  "apps/frontend/src/components/layout/FlatFieldGrid.tsx",
  "apps/frontend/src/pages/factoring/FactoringProfilePanel.tsx",
  "apps/frontend/src/pages/CustomerDetail.tsx",
  "apps/frontend/src/pages/VendorDetail.tsx",
  "apps/frontend/src/pages/DriverDetail.tsx",
  "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
  "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
  "apps/frontend/src/pages/accounting/BillDetailPanel.tsx",
];

const NESTED_BOX_PATTERN = /rounded border border-gray-200 bg-gray-50 px-2 py-1\.5/;
const LEGACY_CELL_PATTERN = /function (FieldRow|MetricCell)\(/;

const failures = [];

for (const rel of DETAIL_SURFACES) {
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) {
    failures.push(`${rel} (missing)`);
    continue;
  }
  const source = fs.readFileSync(full, "utf8");
  if (!source.includes("FlatFieldGrid") && !rel.endsWith("FlatFieldGrid.tsx")) {
    failures.push(`${rel} (must import/use FlatFieldGrid)`);
  }
  if (NESTED_BOX_PATTERN.test(source)) {
    failures.push(`${rel} (nested inner box pattern still present)`);
  }
  if (LEGACY_CELL_PATTERN.test(source)) {
    failures.push(`${rel} (legacy FieldRow/MetricCell helper still defined)`);
  }
}

const flatGridPath = path.join(repoRoot, "apps/frontend/src/components/layout/FlatFieldGrid.tsx");
if (fs.existsSync(flatGridPath)) {
  const flatGrid = fs.readFileSync(flatGridPath, "utf8");
  if (!flatGrid.includes("data-flat-field-grid")) {
    failures.push("FlatFieldGrid.tsx (missing data-flat-field-grid marker)");
  }
}

if (failures.length > 0) {
  console.error("[verify-no-nested-box-pattern] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log(`[verify-no-nested-box-pattern] OK (${DETAIL_SURFACES.length} surfaces)`);
