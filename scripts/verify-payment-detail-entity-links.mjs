#!/usr/bin/env node
/**
 * Static guard: Payment detail and BillPayment detail pages must drill through
 * to their customer / vendor via EntityLink, not leave a raw UUID label.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paymentDetail = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/accounting/PaymentDetailPage.tsx"), "utf8");
const billPaymentDetail = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/accounting/BillPaymentDetailPage.tsx"), "utf8");
const errors = [];

if (!/kind="customer"/.test(paymentDetail)) {
  errors.push("PaymentDetailPage missing customer EntityLink");
}
if (!/kind="vendor"/.test(billPaymentDetail)) {
  errors.push("BillPaymentDetailPage missing vendor EntityLink");
}
if (!/EntityLink\s+kind="customer"\s+id=\{payment\.customer_id\}/.test(paymentDetail)) {
  errors.push("PaymentDetailPage customer EntityLink does not use payment.customer_id");
}
if (!/EntityLink\s+kind="vendor"\s+id=\{payment\.mdata_vendor_id\}/.test(billPaymentDetail)) {
  errors.push("BillPaymentDetailPage vendor EntityLink does not use payment.mdata_vendor_id");
}

if (errors.length > 0) {
  for (const e of errors) console.error("FAIL:", e);
  process.exit(1);
}
console.log("PASS: Payment detail pages use EntityLink for customer/vendor hops");
process.exit(0);
