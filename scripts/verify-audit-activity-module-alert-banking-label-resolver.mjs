#!/usr/bin/env node
// ACTIVITY-BY-MODULE-ALERT-AND-BANKING-TASK-SUBJECT-LABEL-LOST — guard
//
// /reports/audit/activity-by-module (and any other /reports/audit/* sibling reusing the shared
// auditSubjectProjection()/auditSubjectJoins() helper) rendered "Subject — not visible" for:
//   - subject_type='alert' (recon.run_started/.completed, RECON-01's twice-daily AM/PM reconciliation
//     job) -- 'alert' had ZERO resolver anywhere, despite subject_id always resolving to a real,
//     joinable accounting.recon_runs row. Confirmed live: 982 rows in prod.
//   - subject_type='task', source_table='banking.bank_transactions' (transaction.categorized) --
//     175 rows in prod.
//   - subject_type='task', source_table='banking.reconciliation_sessions' (reconciliation.started/
//     .completed) -- 6 rows in prod.
// All three were correctly-populated by the emitter (events.event_log), simply never added to this
// shared resolver -- the same "populated but unmapped" shape as the prior AUDIT-ACTIVITY-BY-USER-
// TASK-SUBJECT and VOID-REVERSAL fixes, not a vocabulary or RLS issue.
//
// This guard fails if the 'alert' branch or either new 'task' source_table branch disappears.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/backend/src/audit/audit-reports.routes.ts";

export function check(text) {
  const failures = [];
  const required = [
    { name: "subject_kind branch: task+banking.reconciliation_sessions -> reconciliation_session", re: /source_table = 'banking\.reconciliation_sessions' THEN 'reconciliation_session'/ },
    { name: "subject_kind branch: task+banking.bank_transactions -> bank_transaction", re: /source_table = 'banking\.bank_transactions' THEN 'bank_transaction'/ },
    { name: "subject_label branch for subject_type='alert' (accounting.recon_runs)", re: /WHEN \$\{alias\}\.subject_type = 'alert' THEN NULLIF\(TRIM\(INITCAP\(REPLACE\(audit_recon_run\.run_type, '_', ' '\)\) \|\| ' — ' \|\| to_char\(audit_recon_run\.window_start, 'YYYY-MM-DD'\)\), ''\)/ },
    { name: "subject_label branch for banking.reconciliation_sessions", re: /WHEN 'banking\.reconciliation_sessions' THEN NULLIF\(TRIM\('Reconciliation ' \|\| to_char\(audit_recon_session\.period_start, 'YYYY-MM-DD'\) \|\| '–' \|\| to_char\(audit_recon_session\.period_end, 'YYYY-MM-DD'\)\), ''\)/ },
    { name: "subject_label branch for banking.bank_transactions", re: /WHEN 'banking\.bank_transactions' THEN NULLIF\(TRIM\(COALESCE\(audit_bank_txn\.description, audit_bank_txn\.merchant_name\)\), ''\)/ },
    { name: "LEFT JOIN accounting.recon_runs audit_recon_run", re: /LEFT JOIN accounting\.recon_runs audit_recon_run/ },
    { name: "LEFT JOIN banking.reconciliation_sessions audit_recon_session", re: /LEFT JOIN banking\.reconciliation_sessions audit_recon_session/ },
    { name: "LEFT JOIN banking.bank_transactions audit_bank_txn", re: /LEFT JOIN banking\.bank_transactions audit_bank_txn/ },
  ];
  for (const { name, re } of required) {
    if (!re.test(text)) failures.push(`${FILE} missing: ${name}`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: audit-activity-module-alert-banking-label-resolver");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: audit-reports.routes.ts resolves subject_type='alert' (accounting.recon_runs) and banking.reconciliation_sessions/bank_transactions task labels");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const offender = text.replace(
    "LEFT JOIN accounting.recon_runs audit_recon_run",
    "-- removed for selftest",
  );
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the source");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (removed accounting.recon_runs join) was NOT caught");
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
