#!/usr/bin/env node
// MAINTENANCE-DECISION-LOG-WO-EVENT-PREFIX-NOT-MATCHED — guard
//
// /reports/audit/maintenance-decision-log was 100% empty for every company on prod (0 records,
// confirmed live) despite real work-order lifecycle events existing (wo.created, wo.status_changed
// -- 15 rows for USMCA alone: created -> in_progress -> complete, exactly the "accepted / deferred /
// approved / worked" decision trail the report's own subtitle describes). Root cause: the emitter
// logs these as "wo.created"/"wo.status_changed" (a "wo." prefix), but the report's ILIKE ANY filter
// only matched the literal substring "work_order", which never appears in a "wo."-prefixed
// event_type. Confirmed live: zero events.event_log rows anywhere in prod match "defect"/"dvir"/
// "failure" -- wo.* IS the real decision-log data source, not a separate unimplemented feature.
//
// Fix: add 'wo.%' to the filter's ILIKE ANY array. subject_type='task' + source_table=
// 'maintenance.work_orders' already has a working resolver (auditSubjectProjection's existing
// work_order branch) -- this is purely a filter-pattern gap, not a label-resolution gap.
//
// This guard fails if the 'wo.%' pattern disappears from the filter.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/backend/src/audit/audit-reports.routes.ts";

export function check(text) {
  const failures = [];
  const maintDecisionLogSection = text.slice(text.indexOf("/** Maintenance decision log */"), text.indexOf("/** Deduction trail */"));
  if (!maintDecisionLogSection || maintDecisionLogSection.length < 10) {
    failures.push(`${FILE}: could not locate the maintenance-decision-log route body`);
    return failures;
  }
  if (!/'wo\.%'/.test(maintDecisionLogSection)) {
    failures.push(`${FILE}: maintenance-decision-log's event_type filter no longer includes 'wo.%' -- wo.created/wo.status_changed events (the real decision trail) will disappear again`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: maintenance-decision-log-wo-event-prefix");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: /reports/audit/maintenance-decision-log's filter matches the real wo.* event_type prefix");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const offender = text.replace("'wo.%',", "");
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the source");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (removed 'wo.%' from the filter) was NOT caught");
    process.exit(1);
  }
  const baselineFailures = check(text);
  if (baselineFailures.length > 0) {
    console.error("FAIL(selftest): baseline (unmodified) source unexpectedly fails check()");
    for (const f of baselineFailures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS(selftest): planted offender correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
