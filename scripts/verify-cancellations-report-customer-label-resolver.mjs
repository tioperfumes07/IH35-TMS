#!/usr/bin/env node
// CANCELLATIONS-REPORT-CUSTOMER-LABEL-LOST-FOR-DEACTIVATED-CUSTOMERS -- guard
//
// /reports/cancellations' "BY CUSTOMER" breakdown showed "Unknown customer" for a cancellation
// whose customer was later deactivated -- mdata.customers' own FORCE RLS policy excludes
// deactivated-but-not-deleted rows for a non-bypass reader, so the plain LEFT JOIN produced a
// NULL-extended row even though the customer's name is fully preserved (void-not-delete).
// Confirmed live: TEST-Customer-One-20260806, deactivated_at set, name fully intact.
//
// Same fix family as AUDIT-TRAIL-SUBJECT-LABEL-LOST-FOR-DEACTIVATED-ENTITIES: fall back to the
// canonical same-company resolver (mdata.resolve_customer_label_same_company, SECURITY DEFINER,
// already proven at scale) instead of widening RLS or the join itself.
//
// This guard fails if the fallback disappears.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/backend/src/dispatch/cancellations-report.routes.ts";

export function check(text) {
  const failures = [];
  if (!/COALESCE\(c\.customer_name, mdata\.resolve_customer_label_same_company\(l\.customer_id, lc\.operating_company_id\)\) AS customer_name/.test(text)) {
    failures.push(`${FILE}: cancellations-report no longer falls back to mdata.resolve_customer_label_same_company for its customer_name projection`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: cancellations-report-customer-label-resolver");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: cancellations-report.routes.ts resolves customer labels for deactivated customers");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const offender = text.replace(
    "COALESCE(c.customer_name, mdata.resolve_customer_label_same_company(l.customer_id, lc.operating_company_id)) AS customer_name,",
    "c.customer_name,",
  );
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the source");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (dropped the resolver fallback) was NOT caught");
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
