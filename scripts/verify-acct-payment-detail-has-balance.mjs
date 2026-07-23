#!/usr/bin/env node
/**
 * Payment detail apply-payment open invoices must use server has_balance filter
 * (not dual sent+partial client merge that can miss rows under LIMIT).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = fs.readFileSync(
  path.join(root, "apps/frontend/src/pages/accounting/PaymentDetailPage.tsx"),
  "utf8"
);

const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};

if (page.includes('status: "sent"') || page.includes("status: 'sent'")) {
  fail("PaymentDetailPage must not fetch open invoices via status=sent");
}
if (!page.includes("has_balance: true")) {
  fail("PaymentDetailPage open-invoices query must pass has_balance: true");
}

console.log("PASS: verify-acct-payment-detail-has-balance");
