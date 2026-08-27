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
  // Part A: payload normalization in the void-reversal combined CTE (searched CASE — the switch
  // subject is a 3-way COALESCE since Part C added a third payload-key alias, entity_type)
  { name: "normalization CASE for mdata.loads -> load", re: /= 'mdata\.loads' THEN 'load'/ },
  { name: "normalization CASE for accounting.journal_entries -> journal_entry", re: /= 'accounting\.journal_entries' THEN 'journal_entry'/ },
  { name: "normalization CASE for accounting.bill_payments -> task", re: /= 'accounting\.bill_payments' THEN 'task'/ },
  { name: "normalization CASE for catalogs.load_cancellation_reasons -> task", re: /= 'catalogs\.load_cancellation_reasons' THEN 'task'/ },
  { name: "normalization CASE for catalogs.void_cancel_reasons -> task", re: /= 'catalogs\.void_cancel_reasons' THEN 'task'/ },
  { name: "normalization CASE for mdata.customer_quality_events -> task", re: /= 'mdata\.customer_quality_events' THEN 'task'/ },
  { name: "normalization CASE for driver_finance.driver_settlements -> task", re: /= 'driver_finance\.driver_settlements' THEN 'task'/ },
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
  // Part C: AUDIT-EVENTS-PAYLOAD-NO-RESOURCE-TYPE-FIELD -- payloads with NO type key at all
  // (event_class-keyed fallback), plus the mdata.customers.seed_purge_prod_voided entity_type key.
  { name: "entity_type read alongside resource_type/reversed_entity_type", re: /ae\.payload->>'entity_type'/ },
  { name: "raw-path mapping for mdata.customers -> customer", re: /= 'mdata\.customers' THEN 'customer'/ },
  { name: "event_class fallback for insurance.policy.cancelled -> insurance_policy", re: /WHEN ae\.event_class = 'insurance\.policy\.cancelled' THEN 'insurance_policy'/ },
  { name: "event_class fallback for expense.voided -> expense", re: /WHEN ae\.event_class = 'expense\.voided' THEN 'expense'/ },
  { name: "event_class fallback for ops.daily_task.cancelled -> daily_task", re: /WHEN ae\.event_class = 'ops\.daily_task\.cancelled' THEN 'daily_task'/ },
  { name: "event_class fallback for safety.hos_violation.voided -> hos_violation", re: /WHEN ae\.event_class = 'safety\.hos_violation\.voided' THEN 'hos_violation'/ },
  { name: "event_class fallback for safety.internal_fine.voided -> internal_fine", re: /WHEN ae\.event_class = 'safety\.internal_fine\.voided' THEN 'internal_fine'/ },
  { name: "id COALESCE reads task_id/hos_violation_id/internal_fine_id", re: /ae\.payload->>'task_id', ae\.payload->>'hos_violation_id',\s*\n\s*ae\.payload->>'internal_fine_id'/ },
  { name: "subject_label branch for insurance_policy", re: /WHEN \$\{alias\}\.subject_type = 'insurance_policy' THEN NULLIF\(TRIM\(audit_insurance_policy\.policy_number\), ''\)/ },
  { name: "subject_label branch for expense", re: /WHEN \$\{alias\}\.subject_type = 'expense' THEN NULLIF\(TRIM\(COALESCE\(audit_expense\.expense_number, audit_expense\.memo\)\), ''\)/ },
  { name: "subject_label branch for daily_task", re: /WHEN \$\{alias\}\.subject_type = 'daily_task' THEN NULLIF\(TRIM\(audit_daily_task\.title\), ''\)/ },
  { name: "subject_label branch for hos_violation", re: /WHEN \$\{alias\}\.subject_type = 'hos_violation' THEN NULLIF\(TRIM\(audit_hos_violation\.violation_type\), ''\)/ },
  { name: "subject_label branch for internal_fine", re: /WHEN \$\{alias\}\.subject_type = 'internal_fine' THEN NULLIF\(TRIM\('Fine ' \|\| to_char\(audit_internal_fine\.imposed_date, 'YYYY-MM-DD'\) \|\| ' — \$' \|\| audit_internal_fine\.amount::text\), ''\)/ },
  { name: "LEFT JOIN insurance.policy audit_insurance_policy", re: /LEFT JOIN insurance\.policy audit_insurance_policy/ },
  { name: "LEFT JOIN accounting.expenses audit_expense", re: /LEFT JOIN accounting\.expenses audit_expense/ },
  { name: "LEFT JOIN ops.daily_tasks audit_daily_task", re: /LEFT JOIN ops\.daily_tasks audit_daily_task/ },
  { name: "LEFT JOIN safety.hos_violations audit_hos_violation", re: /LEFT JOIN safety\.hos_violations audit_hos_violation/ },
  { name: "LEFT JOIN safety.internal_fines audit_internal_fine", re: /LEFT JOIN safety\.internal_fines audit_internal_fine/ },
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
  const offender = text.replace("= 'mdata.loads' THEN 'load'", "-- removed for selftest");
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
