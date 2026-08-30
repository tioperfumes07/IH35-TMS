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
const PHANTOM_VIEW_COL = /FROM\s+views\.dispatch_load_with_driver_status[\s\S]{0,2500}l\.is_sample_data/i;
const CANONICAL_LOADS_EXCLUSION =
  /FROM\s+mdata\.loads\s+sample_load[\s\S]{0,160}sample_load\.id\s*=\s*l\.id[\s\S]{0,140}sample_load\.operating_company_id\s*=\s*l\.operating_company_id[\s\S]{0,140}sample_load\.is_sample_data\s+IS\s+NOT\s+TRUE/i;

export function checkExcludesSample(src) {
  const offenders = [];
  if (PHANTOM_VIEW_COL.test(src)) {
    offenders.push(
      `${SERVICE_FILE}: listLateArrivalLoads() reads l.is_sample_data on views.dispatch_load_with_driver_status — that column does not exist (live 500 SQLSTATE 42703)`
    );
  }
  const whereIdx = src.indexOf(WHERE_MARKER);
  if (whereIdx === -1) {
    offenders.push(`${SERVICE_FILE}: WHERE clause marker not found — has listLateArrivalLoads()'s query moved or been rewritten? Re-verify this guard still applies.`);
    return offenders;
  }
  const window = src.slice(whereIdx, whereIdx + 900);
  if (!CANONICAL_LOADS_EXCLUSION.test(window)) {
    offenders.push(
      `${SERVICE_FILE}: listLateArrivalLoads() must company-scope the canonical mdata.loads row before excluding sample data`
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
  const prefix = "FROM views.dispatch_load_with_driver_status l\n        ";
  const missing = `${prefix}WHERE l.operating_company_id = $1::uuid
      AND l.soft_deleted_at IS NULL
      AND l.status IN ('dispatched', 'at_pickup', 'in_transit', 'at_delivery')
  `;
  const phantom500 = `${prefix}WHERE l.operating_company_id = $1::uuid
      AND l.soft_deleted_at IS NULL
      AND l.is_sample_data IS NOT TRUE
      AND l.status IN ('dispatched', 'at_pickup', 'in_transit', 'at_delivery')
  `;
  const fixed = `${prefix}WHERE l.operating_company_id = $1::uuid
      AND l.soft_deleted_at IS NULL
      AND EXISTS (
            SELECT 1
            FROM mdata.loads sample_load
            WHERE sample_load.id = l.id
              AND sample_load.operating_company_id = l.operating_company_id
              AND sample_load.is_sample_data IS NOT TRUE
          )
      AND l.status IN ('dispatched', 'at_pickup', 'in_transit', 'at_delivery')
  `;

  const missingFails = checkExcludesSample(missing).length > 0;
  const phantomFails = checkExcludesSample(phantom500).some((p) => /42703|does not exist/.test(p));
  const fixedPasses = checkExcludesSample(fixed).length === 0;

  if (missingFails && phantomFails && fixedPasses) {
    console.log("verify:late-arrivals-excludes-sample-data selftest OK");
    process.exit(0);
  }
  console.error("verify:late-arrivals-excludes-sample-data selftest FAILED", {
    missingFails,
    phantomFails,
    fixedPasses,
    missing: checkExcludesSample(missing),
    phantom: checkExcludesSample(phantom500),
    fixed: checkExcludesSample(fixed),
  });
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
