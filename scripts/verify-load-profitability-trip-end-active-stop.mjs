#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["profitability","connectivity"],"leaves":["dispatch.load_profitability.trip_end.active_stop"],"task":"DSP-MONEY-F7243-PROFITABILITY-TRIP-END-READS-RETIRED-DELIVERY","vertical":"column-wave"} */
/**
 * DSP-MONEY-F7243-PROFITABILITY-TRIP-END-READS-RETIRED-DELIVERY (CC-1, 2026-08-29):
 * computeLoadProfitability's trip_end subquery picked the latest actual_departure_at across every
 * stop_type='delivery' row for the load, including one archived by the Stops-replace lifecycle
 * (soft_deleted_at IS NOT NULL). A retired delivery stop's own (possibly later) departure could
 * outrank the canonical active delivery's, shifting trip_end and — through it — trip duration, the
 * insurance-allocation denominator, and net profitability after a route revision. Root-caused live
 * in apps/backend/src/dispatch/load-profitability.service.ts. Fixed by adding the same
 * soft_deleted_at IS NULL predicate this session's sibling Codex fixes already standardized on for
 * mdata.load_stops. This guard holds that fix so it cannot regress.
 *
 * Self-test: node scripts/verify-load-profitability-trip-end-active-stop.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  service: "apps/backend/src/dispatch/load-profitability.service.ts",
};
const LABEL = "verify-load-profitability-trip-end-active-stop";

export function audit(src) {
  const failures = [];
  const subqueryMatch = src.service.match(
    /\(SELECT ls\.actual_departure_at[\s\S]*?LIMIT 1\)/,
  );
  if (!subqueryMatch) {
    failures.push(`${FILES.service}: the trip_end delivery-stop subquery was not found`);
    return failures;
  }
  const sql = subqueryMatch[0];
  if (!/ls\.stop_type = 'delivery'/.test(sql)) {
    failures.push(`${FILES.service}: the subquery must still filter on stop_type = 'delivery'`);
  }
  if (!/ls\.soft_deleted_at IS NULL/.test(sql)) {
    failures.push(
      `${FILES.service}: the trip_end delivery-stop subquery must exclude archived stops ` +
        `(ls.soft_deleted_at IS NULL) -- otherwise a retired delivery's departure can outrank the ` +
        `canonical active one and shift trip duration / insurance allocation / net profitability`,
    );
  }
  return failures;
}

function loadSrc(root) {
  return {
    service: fs.readFileSync(path.join(root, FILES.service), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }

  // Mutation: drop the soft_deleted_at IS NULL predicate (the exact pre-fix shape).
  const dropped = {
    service: good.service.replace(
      `             AND ls.stop_type = 'delivery'
             AND ls.actual_departure_at IS NOT NULL
             AND ls.soft_deleted_at IS NULL
           ORDER BY ls.actual_departure_at DESC`,
      `             AND ls.stop_type = 'delivery'
             AND ls.actual_departure_at IS NOT NULL
           ORDER BY ls.actual_departure_at DESC`,
    ),
  };
  if (dropped.service === good.service) {
    console.error(`${LABEL} SELFTEST FAIL — dropped-predicate pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(dropped).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — dropped soft_deleted_at predicate regression escaped`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS — 1 mutation detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — profitability trip_end excludes retired/archived delivery stops`);
