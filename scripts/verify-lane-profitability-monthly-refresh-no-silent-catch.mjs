#!/usr/bin/env node
/**
 * LIAB-F9927-SILENT-CATCH-SWEEP (reports leg) — GO-0012 leftover-unique, continuing the sweep
 * (liabilities.routes.ts #17110, cash-advances.routes.ts #17113, fuel/planner.routes.ts #17116).
 *
 * apps/backend/src/reports/lane-profitability.service.ts's refreshLaneProfitabilityCache() called
 * `reports.refresh_lane_metrics_monthly()` (a foundational function, confirmed live) inside
 * `.catch(() => undefined)` with ZERO logging — a real failure of this secondary monthly rollup was
 * completely invisible. Unlike the read-route sites in this sweep, throwing here would be wrong (this
 * runs synchronously inside a live GET /api/v1/reports/lane-profitability request and refreshes a
 * SEPARATE table than the one that route actually returns — a hard failure would break an unrelated
 * response for a secondary refresh's failure). Fixed the same way as BANK-F9521 (banking suggestions):
 * fail loud IN THE LOGS via the shared structured logger, not silently and not via a hard throw.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const LANE_PROFITABILITY_FILE = "apps/backend/src/reports/lane-profitability.service.ts";

function stripLineComments(src) {
  return src
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

export function check(srcRaw) {
  const src = stripLineComments(srcRaw);
  const failures = [];

  if (/refresh_lane_metrics_monthly\(\)`\)\s*\.catch\(\s*\(\)\s*=>\s*undefined\s*\)/.test(src)) {
    failures.push(`${LANE_PROFITABILITY_FILE}: the silent (no-log) .catch(() => undefined) reappeared on refresh_lane_metrics_monthly() (LIAB-F9927 reports leg)`);
  }

  if (!/logger\.warn\(/.test(src)) {
    failures.push(`${LANE_PROFITABILITY_FILE}: expected logger.warn(...) call on the monthly-refresh failure path not found — guard out of sync or fix reverted`);
  }

  if (!src.includes("reports.refresh_lane_metrics_monthly()")) {
    failures.push(`${LANE_PROFITABILITY_FILE}: expected refresh_lane_metrics_monthly() call not found — guard out of sync`);
  }

  return failures;
}

function readSrc() {
  return fs.readFileSync(path.join(root, LANE_PROFITABILITY_FILE), "utf8");
}

function run() {
  const failures = check(readSrc());
  if (failures.length > 0) {
    console.error("FAIL: lane-profitability-monthly-refresh-no-silent-catch");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: lane-profitability monthly-refresh failure now logs instead of vanishing silently");
}

function selftest() {
  const src = readSrc();
  const baseline = check(src);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Offender: reintroduce the silent no-log catch.
  const offender = src.replace(
    /await client\.query\(`SELECT reports\.refresh_lane_metrics_monthly\(\)`\)\.catch\(\(err\) => \{[\s\S]*?\}\);/,
    "await client.query(`SELECT reports.refresh_lane_metrics_monthly()`).catch(() => undefined);"
  );
  if (offender === src) {
    console.error("FAIL(selftest): offender mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (silent catch reintroduced) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
