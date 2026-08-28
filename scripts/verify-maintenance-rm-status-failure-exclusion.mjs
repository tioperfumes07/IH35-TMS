#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const path = "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx";
const source = fs.readFileSync(path, "utf8");
const selftest = process.argv.includes("--selftest");
const checks = [
  ["R&M outage is explicit and retryable", /rmStatusQuery\.isError\s*\?\s*\(\s*<ListErrorState[\s\S]*?title="Couldn't load R&M status board"[\s\S]*?onRetry=\{\(\) => void rmStatusQuery\.refetch\(\)\}/],
  ["bucket grid is success-only, single-flight, and company-scoped", /\)\s*:\s*\(\s*<RMBucketsGrid[\s\S]*?statusActionPending=\{statusMutation\.isPending\}[\s\S]*?onAdvanceStatus=\{\(id, status\) => \{\s*if \(statusMutation\.isPending\) return;\s*statusMutation\.mutate\(\{\s*id,\s*status,\s*companyId,\s*generation: statusGenerationRef\.current,\s*\}\);/],
  ["roadside actions are suppressed on error", /!rmStatusQuery\.isError\s*\?\s*\(\s*<RoadServiceActivePanel/],
  ["all bucket sources remain canonical", /inHouse=\{rmStatusQuery\.data\?\.in_house \?\? \[\]\}[\s\S]*?external=\{rmStatusQuery\.data\?\.external \?\? \[\]\}[\s\S]*?roadside=\{rmStatusQuery\.data\?\.roadside \?\? \[\]\}/],
];

for (const [label, pattern] of checks) assert.match(source, pattern, label);
if (selftest) {
  let killed = 0;
  for (const [, pattern] of checks) {
    const mutant = source.replace(pattern, "/* planted defect */");
    if (!pattern.test(mutant)) killed += 1;
  }
  assert.equal(killed, checks.length, `mutation kill count ${killed}/${checks.length}`);
  console.log(`verify-maintenance-rm-status-failure-exclusion selftest PASS (${killed}/${checks.length})`);
} else {
  console.log(`verify-maintenance-rm-status-failure-exclusion PASS (${checks.length} assertions)`);
}
