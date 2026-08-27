#!/usr/bin/env node
// AUDIT-ACTIVITY-BY-USER-TASK-SUBJECT-BANKING-ACCOUNTING-LABEL-LOST — guard
//
// events.event_log's accounting-spine-emit.ts / banking-spine-emit.ts fall back to
// subject_type='task' for "transfer" / "payment" entity_type events (neither is a member of
// event_log's valid_subject_type allowlist), carrying the real table in source_table
// ('banking.transfers' / 'accounting.payments'). apps/backend/src/audit/audit-reports.routes.ts's
// shared auditSubjectProjection()/auditSubjectJoins() CASE only covered
// maintenance.work_orders/accounting.invoices/accounting.bills for the subject_type='task' branch,
// so transfer.created/payment.created rows rendered "task · Subject — not visible" on every one of
// the 7 sibling Audit report pages that share these two helpers — live-confirmed on
// /reports/audit/activity-by-user.
//
// This guard fails if either helper stops covering banking.transfers / accounting.payments in its
// subject_type='task' CASE branches or drops the banking.transfers join.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/backend/src/audit/audit-reports.routes.ts";

export function check(text) {
  const failures = [];
  if (!/source_table = 'banking\.transfers' THEN 'transfer'/.test(text)) {
    failures.push(`${FILE} auditSubjectProjection() no longer maps source_table='banking.transfers' to subject_kind 'transfer'`);
  }
  if (!/source_table = 'accounting\.payments' THEN 'payment'/.test(text)) {
    failures.push(`${FILE} auditSubjectProjection() no longer maps source_table='accounting.payments' to subject_kind 'payment'`);
  }
  if (!/WHEN 'banking\.transfers' THEN NULLIF\(TRIM\(COALESCE\(audit_transfer\.reference_number, audit_transfer\.memo\)\), ''\)/.test(text)) {
    failures.push(`${FILE} auditSubjectProjection()'s task-branch CASE no longer resolves a banking.transfers subject_label`);
  }
  if (!/WHEN 'accounting\.payments' THEN NULLIF\(TRIM\(audit_customer_payment\.display_id\), ''\)/.test(text)) {
    failures.push(`${FILE} auditSubjectProjection()'s task-branch CASE no longer resolves an accounting.payments subject_label`);
  }
  if (!/LEFT JOIN banking\.transfers audit_transfer/.test(text)) {
    failures.push(`${FILE} auditSubjectJoins() no longer joins banking.transfers`);
  }
  if (!/source_table = 'accounting\.payments'\s*\n\s*AND audit_customer_payment\.id = \$\{alias\}\.source_reference_id/.test(text)) {
    failures.push(`${FILE} auditSubjectJoins()'s accounting.payments join no longer widens to the subject_type='task' case`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: audit-subject-banking-accounting-label");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: audit-reports.routes.ts resolves transfer.created/payment.created subject labels");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const offender = text.replace(
    "WHEN ${alias}.subject_type = 'task' AND ${alias}.source_table = 'banking.transfers' THEN 'transfer'\n      WHEN ${alias}.subject_type = 'task' AND ${alias}.source_table = 'accounting.payments' THEN 'payment'\n      ",
    "",
  );
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the source");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (removed transfer/payment subject_kind mapping) was NOT caught");
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
