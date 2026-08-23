#!/usr/bin/env node
/**
 * verify-late-arrivals-excludes-sample-data.mjs  (DISPATCH-F2)
 *
 * Root cause: HOME's "In-flight loads running late" card (apps/backend/src/reports/library.routes.ts,
 * type dispatch_loads_in_flight_late) correctly excludes `l.is_sample_data IS NOT TRUE` when computing
 * its count, but its own "Open late arrivals" action_url (/dispatch/alerts/late-arrivals) is served by
 * listLateArrivalLoads() in late-arrivals.service.ts, whose query had NO is_sample_data filter at all.
 * Live-reproduced 2026-08-23: HOME showed "In-flight loads running late — Count 2"; clicking through to
 * "Open late arrivals" showed 3 rows — the extra row (LUSMCAFREIGHT-20260808-0001, "ZZ-SAMPLE Customer A")
 * confirmed via direct prod SQL to have is_sample_data = true. The summary card and the page it links to
 * disagreed about the same underlying alert, and a test-fixture load leaked into an actionable dispatch
 * alert list a real dispatcher would work off of.
 *
 * This guard makes the regression impossible to re-ship: listLateArrivalLoads()'s query must exclude
 * is_sample_data rows, matching the HOME card's own convention.
 *
 * Usage:
 *   node scripts/verify-late-arrivals-excludes-sample-data.mjs            # scan
 *   node scripts/verify-late-arrivals-excludes-sample-data.mjs --selftest # regression harness -> must FAIL on bug
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const SERVICE_FILE = "apps/backend/src/dispatch/late-arrivals.service.ts";

const WHERE_MARKER = "WHERE l.operating_company_id = $1::uuid";
const SAMPLE_EXCLUSION = /l\.is_sample_data\s+IS\s+NOT\s+TRUE/i;

export function checkExcludesSample(src) {
  const offenders = [];
  const whereIdx = src.indexOf(WHERE_MARKER);
  if (whereIdx === -1) {
    offenders.push(`${SERVICE_FILE}: WHERE clause marker not found — has listLateArrivalLoads()'s query moved or been rewritten? Re-verify this guard still applies.`);
    return offenders;
  }
  // The is_sample_data exclusion must appear within the WHERE clause of this specific query (a
  // reasonable window after the marker), not just anywhere in the file.
  const window = src.slice(whereIdx, whereIdx + 600);
  if (!SAMPLE_EXCLUSION.test(window)) {
    offenders.push(
      `${SERVICE_FILE}: listLateArrivalLoads()'s query does not exclude is_sample_data rows — DISPATCH-F2 regression shape (HOME's "In-flight loads running late" count excludes sample loads, but the "Open late arrivals" page it links to would not)`
    );
  }
  return offenders;
}

export function run() {
  const abs = path.join(repoRoot, SERVICE_FILE);
  const src = fs.readFileSync(abs, "utf8");
  const offenders = checkExcludesSample(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    WHERE l.operating_company_id = $1::uuid
      AND l.soft_deleted_at IS NULL
      AND l.status IN ('dispatched', 'at_pickup', 'in_transit', 'at_delivery')
  `;
  const fixed = `
    WHERE l.operating_company_id = $1::uuid
      AND l.soft_deleted_at IS NULL
      AND l.is_sample_data IS NOT TRUE
      AND l.status IN ('dispatched', 'at_pickup', 'in_transit', 'at_delivery')
  `;

  const buggyFails = checkExcludesSample(buggy).length > 0;
  const fixedPasses = checkExcludesSample(fixed).length === 0;

  if (buggyFails && fixedPasses) {
    console.log("verify:late-arrivals-excludes-sample-data selftest OK");
    process.exit(0);
  }
  console.error("verify:late-arrivals-excludes-sample-data selftest FAILED", { buggyFails, fixedPasses });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error("verify:late-arrivals-excludes-sample-data FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "));
    process.exit(1);
  }
  console.log("verify:late-arrivals-excludes-sample-data OK — listLateArrivalLoads() excludes sample-data rows, matching HOME's own card count");
}
