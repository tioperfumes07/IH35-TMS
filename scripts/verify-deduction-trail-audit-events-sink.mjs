#!/usr/bin/env node
// DEDUCTION-TRAIL-MISSING-AUDIT-EVENTS-SINK — guard
//
// /reports/audit/deduction-trail read ONLY events.event_log, which has NEVER carried a single
// deduction/fine event for any company, ever (confirmed live: zero rows anywhere in prod match its
// own filter). Every real deduction/fine transaction event (safety.internal_fine.*,
// safety.company_violation.auto_fine_created, safety.fine.created, driver_finance.deduction.created,
// driver_finance.settlement.deductions_applied) is written to audit.audit_events instead -- the same
// "route reads only one of the two audit sinks" root-cause family as the original VOID-REVERSAL bug.
//
// Fix: UNION events.event_log with audit.audit_events (same combined-CTE shape as void-reversal),
// mapping subject_type/subject_id per event_class since each carries the entity id under its own
// payload key. Reuses existing resolvers (internal_fine, driver, task+driver_finance.
// driver_settlements) and adds one new one (civil_fine, safety.civil_fines).
//
// This guard fails if the combined CTE, its event_class mapping, or the civil_fine resolver disappear.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/backend/src/audit/audit-reports.routes.ts";

export function check(text) {
  const failures = [];
  const start = text.indexOf("/** Deduction trail.");
  const end = text.indexOf("/** Void & reversal report.");
  if (start === -1 || end === -1 || end <= start) {
    failures.push(`${FILE}: could not locate the deduction-trail route body`);
    return failures;
  }
  const section = text.slice(start, end);
  const required = [
    { name: "UNIONs audit.audit_events (combined CTE, not events.event_log alone)", re: /FROM audit\.audit_events ae/ },
    { name: "event_class mapping for safety.internal_fine.* -> internal_fine", re: /'safety\.internal_fine\.created', 'safety\.internal_fine\.voided'\) THEN 'internal_fine'/ },
    { name: "event_class mapping for safety.fine.created -> civil_fine", re: /WHEN ae\.event_class = 'safety\.fine\.created' THEN 'civil_fine'/ },
    { name: "event_class mapping for driver_finance.deduction.created -> driver", re: /WHEN ae\.event_class = 'driver_finance\.deduction\.created' THEN 'driver'/ },
    { name: "event_class mapping for driver_finance.settlement.deductions_applied -> task", re: /WHEN ae\.event_class = 'driver_finance\.settlement\.deductions_applied' THEN 'task'/ },
    { name: "reuses driver_finance.driver_settlements source_table for the settlement task branch", re: /THEN 'driver_finance\.driver_settlements' ELSE NULL END AS source_table/ },
    { name: "optional driver_id filter applies to the combined result (not just events.event_log)", re: /\$\{driverPos \? `WHERE c\.subject_id = \$\$\{driverPos\}::uuid` : ""\}/ },
  ];
  for (const { name, re } of required) {
    if (!re.test(section)) failures.push(`${FILE} (deduction-trail route): missing ${name}`);
  }
  if (!/WHEN \$\{alias\}\.subject_type = 'civil_fine' THEN NULLIF\(TRIM\(COALESCE\(audit_civil_fine\.violation_code, audit_civil_fine\.violation_description\)\), ''\)/.test(text)) {
    failures.push(`${FILE}: missing subject_label branch for civil_fine`);
  }
  if (!/LEFT JOIN safety\.civil_fines audit_civil_fine/.test(text)) {
    failures.push(`${FILE}: missing LEFT JOIN safety.civil_fines audit_civil_fine`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: deduction-trail-audit-events-sink");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: /reports/audit/deduction-trail UNIONs audit.audit_events and resolves internal_fine/civil_fine/driver/settlement subjects");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const offender = text.replace("FROM audit.audit_events ae\n        WHERE ae.event_class ILIKE ANY(ARRAY['%deduction%','%fine%','%accident_cost%','%chargeback%'])", "-- removed for selftest");
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the source");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (removed the audit.audit_events UNION arm) was NOT caught");
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
