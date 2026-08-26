#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const path = "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx";
const source = fs.readFileSync(path, "utf8");
const selftest = process.argv.includes("--selftest");
const checks = [
  ["severe-alert outage is explicit and retryable", /severeAlertsQuery\.isError\s*\?\s*\(\s*<ListErrorState[\s\S]*?title="Couldn't load severe maintenance alerts"[\s\S]*?onRetry=\{\(\) => void severeAlertsQuery\.refetch\(\)\}/],
  ["severe-alert band is success-only", /\)\s*:\s*\(\s*<SevereAlertsBand[\s\S]*?alerts=\{severeAlertsQuery\.data\?\.alerts \?\? \[\]\}/],
  ["server total remains canonical", /totalCount=\{severeAlertsQuery\.data\?\.total_count \?\? severeAlertsQuery\.data\?\.alerts\?\.length \?\? 0\}/],
];

for (const [label, pattern] of checks) assert.match(source, pattern, label);
if (selftest) {
  let killed = 0;
  for (const [, pattern] of checks) {
    const mutant = source.replace(pattern, "/* planted defect */");
    if (!pattern.test(mutant)) killed += 1;
  }
  assert.equal(killed, checks.length, `mutation kill count ${killed}/${checks.length}`);
  console.log(`verify-maintenance-severe-alerts-failure-exclusion selftest PASS (${killed}/${checks.length})`);
} else {
  console.log(`verify-maintenance-severe-alerts-failure-exclusion PASS (${checks.length} assertions)`);
}
