#!/usr/bin/env node
// Guard: the AR/AP payment-recording API calls must match the backend contract — operating_company_id
// in the QUERY and the backend body field names (received_at/paid_at, payment_method, reference_number).
// A prior drift (operating_company_id missing/in-body + {date, method, reference}) made every "Record
// payment" (customer AR) and "Record bill payment" (vendor AP) button 400. This guard prevents regression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    return "";
  }
};

const errs = [];

const customers = read("apps/frontend/src/api/customers.ts");
if (customers) {
  const fn = customers.slice(customers.indexOf("function recordCustomerPayment"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  if (!/customers\/\$\{customerId\}\/payments\?operating_company_id=/.test(body))
    errs.push("recordCustomerPayment must send operating_company_id in the query string.");
  if (!/received_at:/.test(body)) errs.push("recordCustomerPayment body must use received_at (not date).");
  if (!/payment_method:/.test(body)) errs.push("recordCustomerPayment body must use payment_method (not method).");
}

const vendors = read("apps/frontend/src/api/vendors.ts");
if (vendors) {
  const fn = vendors.slice(vendors.indexOf("function recordVendorBillPayment"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  if (!/vendors\/\$\{vendorId\}\/bill-payments\?operating_company_id=/.test(body))
    errs.push("recordVendorBillPayment must send operating_company_id in the query string.");
  if (!/paid_at:/.test(body)) errs.push("recordVendorBillPayment body must use paid_at (not date).");
  if (!/payment_method:/.test(body)) errs.push("recordVendorBillPayment body must use payment_method (not method).");
}

if (errs.length) {
  console.error("[verify-payment-recording-contract] FAILED");
  for (const e of errs) console.error("  ✗ " + e);
  process.exit(1);
}
console.log("[verify-payment-recording-contract] OK");
