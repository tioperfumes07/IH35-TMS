#!/usr/bin/env node
/**
 * REPORTS-F6362 — /reports/geofence-dwell 500'd on every request: {"code":"42703","message":
 * "column o.operating_company_id does not exist"}. The `ordered` CTE selected geofence_id/unit_id/
 * driver_id/event_kind/occurred_at from geo.geofence_events but never selected operating_company_id,
 * while the outer query (aliased `o`) references o.operating_company_id three times (the unit join,
 * the driver join, and the driver-authorization EXISTS subquery). The frontend showed a perpetual
 * "Loading..." row instead of surfacing the 500 -- a silent failure, not an honest empty state.
 */
import fs from "node:fs";

const FILE = "apps/backend/src/reports/geofence-dwell.routes.ts";
const source = fs.readFileSync(FILE, "utf8");

function cte(text) {
  const start = text.indexOf("WITH ordered AS (");
  const end = text.indexOf(")\n          SELECT", start);
  return start >= 0 && end > start ? text.slice(start, end) : "";
}

function audit(text) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  const orderedCte = cte(text);
  need(orderedCte.length > 0, "ordered CTE not found");
  need(/ev\.operating_company_id,/.test(orderedCte), "ordered CTE must select ev.operating_company_id so the outer query's o.operating_company_id references resolve");
  // The three outer references this fix depends on must still be present.
  const outerReferences = (text.match(/o\.operating_company_id/g) ?? []).length;
  need(outerReferences >= 3, `expected at least 3 outer o.operating_company_id references, found ${outerReferences}`);
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-geofence-dwell-cte-operating-company-id FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutated = source.replace("ev.operating_company_id,\n", "");
  if (mutated === source || audit(mutated).length === 0) {
    throw new Error("mutation escaped: removing ev.operating_company_id from the ordered CTE was not caught");
  }
  console.log("verify-geofence-dwell-cte-operating-company-id SELFTEST PASS — 1/1 mutation detected");
}

console.log("verify-geofence-dwell-cte-operating-company-id PASS — ordered CTE selects operating_company_id, outer o.operating_company_id references resolve");
