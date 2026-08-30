#!/usr/bin/env node
// CUSTVEND-VENDOR-CREDIT-PAYMENT-METHOD-SUBJECT-LOST: live-observed on /reports/audit/void-reversal --
// accounting.vendor_credits.voided and mdata.vendor_payment_methods.voided rows rendered as
// "accounting.vendor_credits · Subject — not visible" / "mdata.vendor_payment_methods · Subject —
// not visible" instead of a real label. Same root cause family as the earlier
// VOID-REVERSAL-REPORT-PAYLOAD-SUBJECT-TYPE-VOCABULARY-MISMATCH / AUDIT-EVENTS-PAYLOAD-NO-RESOURCE-TYPE-FIELD
// fixes: these two real, intentional resource_type payload values were never added to (1) the
// void-reversal route's raw-path normalization CASE, or (2) the shared auditSubjectProjection()/
// auditSubjectJoins() helper both source-tables need a CASE branch + LEFT JOIN in. Guard requires
// all three sites to carry both new source_table values.
import fs from "node:fs";

const FILE = "apps/backend/src/audit/audit-reports.routes.ts";

function inspect(source) {
  const failures = [];

  if (!/= 'accounting\.vendor_credits' THEN 'task'/.test(source)) {
    failures.push("void-reversal normalization CASE has no accounting.vendor_credits -> 'task' mapping");
  }
  if (!/= 'mdata\.vendor_payment_methods' THEN 'task'/.test(source)) {
    failures.push("void-reversal normalization CASE has no mdata.vendor_payment_methods -> 'task' mapping");
  }
  if (!/^\s*WHEN \$\{alias\}\.subject_type = 'task' AND \$\{alias\}\.source_table = 'accounting\.vendor_credits' THEN 'vendor_credit'\s*$/m.test(source)) {
    failures.push("auditSubjectProjection() subject_kind CASE has no accounting.vendor_credits branch");
  }
  if (!/^\s*WHEN \$\{alias\}\.subject_type = 'task' AND \$\{alias\}\.source_table = 'mdata\.vendor_payment_methods' THEN 'vendor_payment_method'\s*$/m.test(source)) {
    failures.push("auditSubjectProjection() subject_kind CASE has no mdata.vendor_payment_methods branch");
  }
  if (!/WHEN 'accounting\.vendor_credits' THEN NULLIF\(TRIM\(audit_vendor_credit\.display_id\), ''\)/.test(source)) {
    failures.push("auditSubjectProjection() subject_label task-branch has no accounting.vendor_credits resolver");
  }
  if (!/WHEN 'mdata\.vendor_payment_methods' THEN NULLIF\(TRIM\(COALESCE\(audit_vendor_payment_method\.bank_name/.test(source)) {
    failures.push("auditSubjectProjection() subject_label task-branch has no mdata.vendor_payment_methods resolver");
  }
  if (!/LEFT JOIN accounting\.vendor_credits audit_vendor_credit[\s\S]{0,300}source_table = 'accounting\.vendor_credits'/.test(source)) {
    failures.push("auditSubjectJoins() has no accounting.vendor_credits LEFT JOIN");
  }
  if (!/LEFT JOIN mdata\.vendor_payment_methods audit_vendor_payment_method[\s\S]{0,300}source_table = 'mdata\.vendor_payment_methods'/.test(source)) {
    failures.push("auditSubjectJoins() has no mdata.vendor_payment_methods LEFT JOIN");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(FILE, "utf8");
  const realFailures = inspect(real);
  if (realFailures.length !== 0) {
    console.error("verify-audit-vendor-credit-payment-method-subject --selftest FAILED: real source itself fails:", realFailures);
    process.exit(1);
  }
  const mutated = real.replace(
    "WHEN 'accounting.vendor_credits' THEN NULLIF(TRIM(audit_vendor_credit.display_id), '')\n        WHEN 'mdata.vendor_payment_methods' THEN NULLIF(TRIM(COALESCE(audit_vendor_payment_method.bank_name, CASE audit_vendor_payment_method.method_type WHEN 'ach' THEN 'ACH' ELSE INITCAP(audit_vendor_payment_method.method_type) END) || COALESCE(' ••' || audit_vendor_payment_method.account_mask, '')), '')\n        ELSE NULL",
    "ELSE NULL"
  );
  if (mutated === real) {
    console.error("verify-audit-vendor-credit-payment-method-subject --selftest: mutation did not match live source — update the test");
    process.exit(1);
  }
  const mutatedFailures = inspect(mutated);
  if (mutatedFailures.length === 0) {
    console.error("verify-audit-vendor-credit-payment-method-subject --selftest FAILED: mutation was not caught");
    process.exit(1);
  }
  console.log("verify-audit-vendor-credit-payment-method-subject --selftest: OK (mutation caught, real source clean)");
  process.exit(0);
}

const source = fs.readFileSync(FILE, "utf8");
const failures = inspect(source);
if (failures.length > 0) {
  console.error("verify-audit-vendor-credit-payment-method-subject FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("verify-audit-vendor-credit-payment-method-subject: OK — vendor_credits/vendor_payment_methods void-reversal rows resolve real subject labels");
