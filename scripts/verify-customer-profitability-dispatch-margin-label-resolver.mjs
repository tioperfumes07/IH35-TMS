#!/usr/bin/env node
// AUDIT-TRAIL-SUBJECT-LABEL-LOST-FOR-DEACTIVATED-ENTITIES — customer-profitability + dispatch-margin
// wiring guard.
//
// mdata.customers' FORCE RLS policy excludes deactivated-but-not-deleted rows for a non-bypass
// reader, so a plain LEFT JOIN / blanket scan against mdata.customers silently loses the display
// name for any customer that was later deactivated, even though the referencing load/report row is
// entirely real. /reports/customer-profitability and /reports/dispatch-margin both hit this live
// (customer_name resolved as "Customer — not visible" for a real, deactivated-not-deleted customer).
//
// Fix: both routes fall back to the canonical same-company label resolver
// (mdata.resolve_customer_label_same_company, SECURITY DEFINER, already proven at scale by
// invoices/payments/transaction-register.routes.ts) instead of widening the RLS-scoped read.
//
// This guard fails if either route stops calling the resolver for a missing/NULL customer name.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILES = {
  customerProfitability: "apps/backend/src/reports/customer-profitability.routes.ts",
  dispatchMargin: "apps/backend/src/reports/dispatch-margin.routes.ts",
};

export function check(texts) {
  const failures = [];
  if (!/mdata\.resolve_customer_label_same_company\(cid, \$2::uuid\)/.test(texts.customerProfitability)) {
    failures.push(`${FILES.customerProfitability} no longer resolves missing customer names via mdata.resolve_customer_label_same_company`);
  }
  if (!/missingCustomerIds/.test(texts.customerProfitability)) {
    failures.push(`${FILES.customerProfitability} no longer computes missingCustomerIds against nameMap`);
  }
  if (!/COALESCE\(c\.customer_name, mdata\.resolve_customer_label_same_company\(l\.customer_id, \$1::uuid\)\)/.test(texts.dispatchMargin)) {
    failures.push(`${FILES.dispatchMargin} no longer falls back to mdata.resolve_customer_label_same_company for its customer_name projection`);
  }
  return failures;
}

function readAll() {
  return {
    customerProfitability: fs.readFileSync(path.join(root, FILES.customerProfitability), "utf8"),
    dispatchMargin: fs.readFileSync(path.join(root, FILES.dispatchMargin), "utf8"),
  };
}

function run() {
  const texts = readAll();
  const failures = check(texts);
  if (failures.length > 0) {
    console.error("FAIL: customer-profitability-dispatch-margin-label-resolver");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: customer-profitability.routes.ts + dispatch-margin.routes.ts wire the same-company label resolver");
}

function selftest() {
  const texts = readAll();
  const offender = {
    ...texts,
    dispatchMargin: texts.dispatchMargin.replace(
      "COALESCE(c.customer_name, mdata.resolve_customer_label_same_company(l.customer_id, $1::uuid)) AS customer_name",
      "c.customer_name AS customer_name",
    ),
  };
  if (offender.dispatchMargin === texts.dispatchMargin) {
    console.error("FAIL(selftest): offender mutation did not change the source");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (dropped dispatch-margin resolver fallback) was NOT caught");
    process.exit(1);
  }
  const baselineFailures = check(texts);
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
