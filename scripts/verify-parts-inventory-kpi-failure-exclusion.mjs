#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const path = "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx";
const source = fs.readFileSync(path, "utf8");
const selftest = process.argv.includes("--selftest");
const checks = [
  ["KPI failure is explicit and retryable", /partsInventoryKpisQuery\.isError\s*\?\s*\(\s*<ListErrorState[\s\S]*?title="Couldn't load parts inventory KPIs"[\s\S]*?onRetry=\{\(\) => void partsInventoryKpisQuery\.refetch\(\)\}/],
  ["total-parts suppresses failed cached data", /partsInventoryKpisQuery\.isError\s*\?\s*"—"\s*:\s*\(partsInventoryKpisQuery\.data\?\.total_parts \?\? 0\)/],
  ["low-stock suppresses failed cached data", /partsInventoryKpisQuery\.isError\s*\?\s*"—"\s*:\s*\(partsInventoryKpisQuery\.data\?\.low_stock_count \?\? 0\)/],
  ["inventory value suppresses failed cached data", /partsInventoryKpisQuery\.isError[\s\S]*?\?\s*"—"[\s\S]*?:\s*`\$\$\{Number\(partsInventoryKpisQuery\.data\?\.total_inventory_value \?\? 0\)\.toLocaleString\(\)\}`/],
];

for (const [label, pattern] of checks) assert.match(source, pattern, label);
if (selftest) {
  let killed = 0;
  for (const [, pattern] of checks) {
    const mutant = source.replace(pattern, "/* planted defect */");
    if (!pattern.test(mutant)) killed += 1;
  }
  assert.equal(killed, checks.length, `mutation kill count ${killed}/${checks.length}`);
  console.log(`verify-parts-inventory-kpi-failure-exclusion selftest PASS (${killed}/${checks.length})`);
} else {
  console.log(`verify-parts-inventory-kpi-failure-exclusion PASS (${checks.length} assertions)`);
}
