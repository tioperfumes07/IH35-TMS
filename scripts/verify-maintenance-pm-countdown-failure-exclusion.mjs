#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const path = "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx";
const source = fs.readFileSync(path, "utf8");
const selftest = process.argv.includes("--selftest");
const exactError = /pmDueQuery\.isError\s*\?\s*\(\s*<ListErrorState[\s\S]*?title="Couldn't load PM countdown"[\s\S]*?onRetry=\{\(\) => void pmDueQuery\.refetch\(\)\}/g;
const errorMatches = source.match(exactError) ?? [];

assert.equal(errorMatches.length, 2, "main and compact PM countdown placements must both fail loud");
assert.match(source, /<MaintenancePmCountdownCards rows=\{pmDueQuery\.data\?\.rows \?\? \[\]\} loading=\{pmDueQuery\.isLoading\} \/>/, "main successful countdown remains wired");
assert.match(source, /<MaintenancePmCountdownCards rows=\{pmDueQuery\.data\?\.rows \?\? \[\]\} loading=\{pmDueQuery\.isLoading\} compact \/>/, "compact successful countdown remains wired");

if (selftest) {
  const mutants = [
    source.replace(exactError, "/* planted main error defect */"),
    source.replace(/onRetry=\{\(\) => void pmDueQuery\.refetch\(\)\}/g, "onRetry={undefined}"),
    source.replace(/compact \/>/, "/>"),
  ];
  const killed = mutants.filter((mutant, index) => {
    if (index === 0) return (mutant.match(exactError) ?? []).length !== 2;
    if (index === 1) return (mutant.match(/onRetry=\{\(\) => void pmDueQuery\.refetch\(\)\}/g) ?? []).length !== 2;
    return !/<MaintenancePmCountdownCards[^>]*compact \/>/.test(mutant);
  }).length;
  assert.equal(killed, mutants.length, `mutation kill count ${killed}/${mutants.length}`);
  console.log(`verify-maintenance-pm-countdown-failure-exclusion selftest PASS (${killed}/${mutants.length})`);
} else {
  console.log("verify-maintenance-pm-countdown-failure-exclusion PASS (both placements + Retry)");
}
