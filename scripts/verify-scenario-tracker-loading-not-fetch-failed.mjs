#!/usr/bin/env node
/**
 * verify-scenario-tracker-loading-not-fetch-failed.mjs
 * LV-PROGRAM-SCENARIO-TRACKER-FETCH-FAILED
 *
 * ScenarioTrackerHome must not treat "no payload yet" as fetchFailed — that
 * paints a false "STALE — scenario-tracker unreachable (fetch failed)" banner
 * during the initial poll and dashes every Now value.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-scenario-tracker-loading-not-fetch-failed";
const TARGET = "apps/frontend/src/pages/program/scenario-tracker/ScenarioTrackerHome.tsx";

function analyze(src) {
  const failures = [];
  if (/fetchFailed\s*\|\|\s*!payload/.test(src)) {
    failures.push('must not pass fetchFailed || !payload into evaluateScenarioTrackerStaleness');
  }
  if (!/if\s*\(\s*!fetchFailed\s*&&\s*!payload\s*\)/.test(src)) {
    failures.push("loading path must short-circuit (!fetchFailed && !payload) before STALE evaluation");
  }
  if (!/evaluateScenarioTrackerStaleness\s*\(/.test(src)) {
    failures.push("must still call evaluateScenarioTrackerStaleness on real payloads/errors");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const bad = `
    evaluateScenarioTrackerStaleness({ fetchFailed: fetchFailed || !payload });
  `;
  const good = `
    if (!fetchFailed && !payload) return { stale: false };
    evaluateScenarioTrackerStaleness({ fetchFailed });
  `;
  if (analyze(bad).length === 0) fail("selftest expected BAD to fail");
  const g = analyze(good);
  if (g.length) fail(`selftest expected GOOD: ${g.join("; ")}`);
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = fs.readFileSync(path.join(process.cwd(), TARGET), "utf8");
const failures = analyze(src);
if (failures.length) fail(failures.join("; "));
console.log(`${LABEL} PASS — scenario-tracker loading is not false fetch-failed`);
