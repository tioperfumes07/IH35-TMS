#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const path = "apps/frontend/src/pages/maintenance/tires/TireWearDashboard.tsx";
const source = fs.readFileSync(path, "utf8");
const selftest = process.argv.includes("--selftest");
const checks = [
  ["failed reads suppress the cached projection count", /atRiskQ\.isError\s*\?\s*"Projection count unavailable"\s*:\s*`\$\{rows\.length\} tire positions projected for replacement`/],
  ["failed reads replace the table with an explicit error state", /atRiskQ\.isError\s*\?\s*\(\s*<ListErrorState[\s\S]*?title="Couldn't load at-risk tires"/],
  ["the error state retries the canonical query", /onRetry=\{\(\) => void atRiskQ\.refetch\(\)\}/],
];

for (const [label, pattern] of checks) assert.match(source, pattern, label);
if (selftest) {
  let killed = 0;
  for (const [, pattern] of checks) {
    const mutant = source.replace(pattern, "/* planted defect */");
    if (!pattern.test(mutant)) killed += 1;
  }
  assert.equal(killed, checks.length, `mutation kill count ${killed}/${checks.length}`);
  console.log(`verify-tire-wear-failure-exclusion selftest PASS (${killed}/${checks.length})`);
} else {
  console.log(`verify-tire-wear-failure-exclusion PASS (${checks.length} assertions)`);
}
