#!/usr/bin/env node
/**
 * CLOSURE-18 CI guard — fail PR if performance measurements regress >10% vs budgets.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-perf-budgets-not-regressed";
const BUDGETS_PATH = path.join(ROOT, "docs/perf-budgets.json");
const REGRESSION_THRESHOLD = 0.1;

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`[${LABEL}] FAIL: missing ${path.relative(ROOT, filePath)}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function checkRatio(label, actual, budget, failures) {
  if (actual == null || budget == null) return;
  if (budget <= 0) return;
  const ratio = actual / budget;
  if (ratio > 1 + REGRESSION_THRESHOLD) {
    failures.push(`${label}: ${actual} exceeds budget ${budget} by ${Math.round((ratio - 1) * 100)}%`);
  }
}

function checkCeiling(label, actual, ceiling, failures) {
  if (actual == null || ceiling == null) return;
  if (actual > ceiling) {
    failures.push(`${label}: ${actual} exceeds hard ceiling ${ceiling}`);
  }
}

function main() {
  const budgets = readJson(BUDGETS_PATH);
  const b = budgets.budgets ?? {};
  const ceilings = budgets.hard_ceilings ?? {};
  const failures = [];

  checkRatio("fe_bundle_gzipped", budgets.fe_bundle_gzipped, b.fe_bundle_gzipped, failures);
  checkRatio("fe_bundle_uncompressed", budgets.fe_bundle_uncompressed, b.fe_bundle_uncompressed, failures);
  checkRatio("driver_bundle_gzipped", budgets.driver_bundle_gzipped, b.driver_bundle_gzipped, failures);
  checkRatio("driver_bundle_uncompressed", budgets.driver_bundle_uncompressed, b.driver_bundle_uncompressed, failures);
  checkCeiling("fe_bundle_uncompressed", budgets.fe_bundle_uncompressed, ceilings.fe_bundle_uncompressed, failures);

  // Lighthouse mobile baselines are documented in PERF-AUDIT; guard bundle + API only.
  for (const [endpoint, stats] of Object.entries(budgets.api_latency_ms ?? {})) {
    const isWrite = /POST|PUT|PATCH|DELETE/i.test(endpoint) || endpoint.includes("sync");
    const budget = isWrite ? b.api_p95_write_ms : b.api_p95_read_ms;
    checkRatio(`${endpoint} p95`, stats.p95, budget, failures);
    checkCeiling(`${endpoint} p95`, stats.p95, isWrite ? ceilings.api_p95_write_ms : ceilings.api_p95_read_ms, failures);
  }

  if (failures.length > 0) {
    console.error(`[${LABEL}] FAIL (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(`[${LABEL}] PASS — budgets within ${REGRESSION_THRESHOLD * 100}% tolerance`);
}

main();
