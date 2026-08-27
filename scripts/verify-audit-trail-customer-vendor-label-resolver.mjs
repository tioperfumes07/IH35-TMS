#!/usr/bin/env node
// AUDIT-TRAIL-SUBJECT-LABEL-LOST-FOR-DEACTIVATED-ENTITIES — the original, core finding: every
// /reports/audit/* endpoint (all 7 siblings sharing auditSubjectProjection()/auditSubjectJoins())
// silently loses the subject label ("Subject — not visible") for any customer.*/vendor.* audit
// event whose subject was LATER deactivated. mdata.customers'/mdata.vendors' own FORCE RLS
// policies exclude deactivated-but-not-deleted rows for a non-bypass reader, so the audit_customer/
// audit_vendor LEFT JOINs never see the row at all — not a WHERE-filtered NULL, a genuinely absent
// join candidate.
//
// Fix: fall back to the canonical same-company label resolvers (mdata.resolve_customer_label_same_company,
// mdata.resolve_vendor_label_same_company — both SECURITY DEFINER, both already proven at scale by
// invoices/payments/transaction-register/customer-profitability/dispatch-margin) instead of widening
// RLS or the join itself. No new migration — both resolvers already exist.
//
// This guard fails if auditSubjectProjection() stops falling back to either resolver for its
// customer/vendor subject_label branches.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/backend/src/audit/audit-reports.routes.ts";

export function check(text) {
  const failures = [];
  if (!/subject_type = 'customer' THEN COALESCE\(NULLIF\(TRIM\(audit_customer\.customer_name\), ''\), mdata\.resolve_customer_label_same_company\(\$\{alias\}\.subject_id, \$\{alias\}\.operating_company_id\)\)/.test(text)) {
    failures.push(`${FILE} no longer falls back to mdata.resolve_customer_label_same_company for its subject_type='customer' subject_label`);
  }
  if (!/subject_type = 'vendor' THEN COALESCE\(NULLIF\(TRIM\(audit_vendor\.vendor_name\), ''\), mdata\.resolve_vendor_label_same_company\(\$\{alias\}\.subject_id, \$\{alias\}\.operating_company_id\)\)/.test(text)) {
    failures.push(`${FILE} no longer falls back to mdata.resolve_vendor_label_same_company for its subject_type='vendor' subject_label`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: audit-trail-customer-vendor-label-resolver");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: audit-reports.routes.ts resolves customer/vendor subject labels for deactivated entities");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const offender = text.replace(
    "WHEN ${alias}.subject_type = 'customer' THEN COALESCE(NULLIF(TRIM(audit_customer.customer_name), ''), mdata.resolve_customer_label_same_company(${alias}.subject_id, ${alias}.operating_company_id))",
    "WHEN ${alias}.subject_type = 'customer' THEN NULLIF(TRIM(audit_customer.customer_name), '')",
  );
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the source");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (dropped customer resolver fallback) was NOT caught");
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
