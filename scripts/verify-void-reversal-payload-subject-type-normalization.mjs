#!/usr/bin/env node
// VOID-REVERSAL-REPORT-PAYLOAD-SUBJECT-TYPE-VOCABULARY-MISMATCH — guard
//
// /reports/audit/void-reversal's `combined` CTE UNIONs events.event_log (whose subject_type column
// uses the short vocabulary auditSubjectProjection() expects: 'task', 'invoice', 'load', ...) with
// audit.audit_events (whose subject_type/source_table are derived from a JSON payload field,
// resource_type/reversed_entity_type, that stores raw dotted table-path strings like literally
// "accounting.invoices" for a different event-emission convention). Without normalization, every
// audit.audit_events-sourced row rendered its raw table path as subject_kind and NULL as
// subject_label ("Subject — not visible") because auditSubjectProjection()'s CASE never matches a
// raw path.
//
// Fix: normalize the 9 confirmed raw-path values to the short vocabulary in the combined CTE
// (mdata.loads->load, accounting.journal_entries->journal_entry, 7 others->task+matching
// source_table), and extend auditSubjectProjection()/auditSubjectJoins() with the 5 entity joins
// that had no resolver at all (accounting.bill_payments, catalogs.load_cancellation_reasons,
// catalogs.void_cancel_reasons, mdata.customer_quality_events, driver_finance.driver_settlements).
//
// This guard fails if the normalization CASE or any of the 5 new joins/CASE branches disappear.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/backend/src/audit/audit-reports.routes.ts";

const REQUIRED_PATTERNS = [
  // Part A: payload normalization in the void-reversal combined CTE
  { name: "normalization CASE for mdata.loads -> load", re: /WHEN 'mdata\.loads' THEN 'load'/ },
  { name: "normalization CASE for accounting.journal_entries -> journal_entry", re: /WHEN 'accounting\.journal_entries' THEN 'journal_entry'/ },
  { name: "normalization CASE for accounting.bill_payments -> task", re: /WHEN 'accounting\.bill_payments' THEN 'task'/ },
  { name: "normalization CASE for catalogs.load_cancellation_reasons -> task", re: /WHEN 'catalogs\.load_cancellation_reasons' THEN 'task'/ },
  { name: "normalization CASE for catalogs.void_cancel_reasons -> task", re: /WHEN 'catalogs\.void_cancel_reasons' THEN 'task'/ },
  { name: "normalization CASE for mdata.customer_quality_events -> task", re: /WHEN 'mdata\.customer_quality_events' THEN 'task'/ },
  { name: "normalization CASE for driver_finance.driver_settlements -> task", re: /WHEN 'driver_finance\.driver_settlements' THEN 'task'/ },
  // Part B: 5 new joins + subject_label CASE branches in the shared helper
  { name: "subject_label branch for accounting.bill_payments", re: /WHEN 'accounting\.bill_payments' THEN NULLIF\(TRIM\(COALESCE\(audit_bill_payment\.reference_number, audit_bill_payment\.check_number, audit_bill_payment\.memo\)\), ''\)/ },
  { name: "subject_label branch for catalogs.load_cancellation_reasons", re: /WHEN 'catalogs\.load_cancellation_reasons' THEN NULLIF\(TRIM\(audit_load_cancel_reason\.display_name\), ''\)/ },
  { name: "subject_label branch for catalogs.void_cancel_reasons", re: /WHEN 'catalogs\.void_cancel_reasons' THEN NULLIF\(TRIM\(audit_void_cancel_reason\.reason_label\), ''\)/ },
  { name: "subject_label branch for mdata.customer_quality_events", re: /WHEN 'mdata\.customer_quality_events' THEN NULLIF\(TRIM\(audit_customer_quality_event\.summary\), ''\)/ },
  { name: "subject_label branch for driver_finance.driver_settlements", re: /WHEN 'driver_finance\.driver_settlements' THEN NULLIF\(TRIM\(audit_driver_settlement\.display_id\), ''\)/ },
  { name: "LEFT JOIN accounting.bill_payments audit_bill_payment", re: /LEFT JOIN accounting\.bill_payments audit_bill_payment/ },
  { name: "LEFT JOIN catalogs.load_cancellation_reasons audit_load_cancel_reason", re: /LEFT JOIN catalogs\.load_cancellation_reasons audit_load_cancel_reason/ },
  { name: "LEFT JOIN catalogs.void_cancel_reasons audit_void_cancel_reason", re: /LEFT JOIN catalogs\.void_cancel_reasons audit_void_cancel_reason/ },
  { name: "LEFT JOIN mdata.customer_quality_events audit_customer_quality_event", re: /LEFT JOIN mdata\.customer_quality_events audit_customer_quality_event/ },
  { name: "LEFT JOIN driver_finance.driver_settlements audit_driver_settlement", re: /LEFT JOIN driver_finance\.driver_settlements audit_driver_settlement/ },
  { name: "subject_label branch for driver_finance.cash_advance_requests", re: /WHEN 'driver_finance\.cash_advance_requests' THEN NULLIF\(TRIM\(audit_cash_advance_request\.display_id\), ''\)/ },
  { name: "LEFT JOIN driver_finance.cash_advance_requests audit_cash_advance_request", re: /LEFT JOIN driver_finance\.cash_advance_requests audit_cash_advance_request/ },
];

export function check(text) {
  const failures = [];
  for (const { name, re } of REQUIRED_PATTERNS) {
    if (!re.test(text)) failures.push(`${FILE} missing: ${name}`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: void-reversal-payload-subject-type-normalization");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: audit-reports.routes.ts normalizes void-reversal's payload subject_type vocabulary and resolves all 9 previously-unmapped entity types");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const offender = text.replace("WHEN 'mdata.loads' THEN 'load'", "-- removed for selftest");
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the source");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (removed mdata.loads normalization) was NOT caught");
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
