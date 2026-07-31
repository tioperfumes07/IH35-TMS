#!/usr/bin/env node
/** ACCT-R-24 — held mig CoA CHECK must keep live roles + broker_customer_advance_liability. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mig = readFileSync(
  resolve(ROOT, "db/migrations/202609100090_nd_inv_01_proforma_invoice_pipeline.sql"),
  "utf8",
);
const required = [
  "heavy_repair_expense",
  "prepaid_asset_default",
  "amortization_expense_default",
  "broker_customer_advance_liability",
  "rent_expense",
  "proforma",
  "INVOICE_PROFORMA_PIPELINE_ENABLED",
];
const missing = required.filter((t) => !mig.includes(t));
if (missing.length) {
  console.error("FAIL verify-acct-r24-coa-role-superset — missing:", missing.join(", "));
  process.exit(1);
}
// Order: live trio must appear before broker role (documentation of true-superset intent)
const iHeavy = mig.indexOf("heavy_repair_expense");
const iBroker = mig.indexOf("broker_customer_advance_liability");
if (iHeavy < 0 || iBroker < 0 || iHeavy > iBroker) {
  console.error("FAIL verify-acct-r24-coa-role-superset — live roles must precede broker_customer_advance_liability");
  process.exit(1);
}
console.log("PASS verify-acct-r24-coa-role-superset");
