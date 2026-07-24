#!/usr/bin/env node
import fs from "node:fs";
const p = "apps/frontend/src/pages/accounting/PaymentDetailPage.tsx";
const src = fs.readFileSync(p, "utf8");
const i = src.indexOf("deposited_to_account_id");
if (i < 0) {
  console.error("FAIL: deposited_to_account_id not found");
  process.exit(1);
}
// Find EntityLink near deposit field
const window = src.slice(Math.max(0, i - 200), i + 250);
if (/kind="bank_account"/.test(window) && /deposited_to_account_id/.test(window)) {
  console.error("FAIL: deposit EntityLink still kind=bank_account (must be account / CoA)");
  process.exit(1);
}
if (!/kind="account"[\s\S]{0,120}deposited_to_account_id|deposited_to_account_id[\s\S]{0,120}kind="account"/.test(window) &&
    !/EntityLink kind="account" id=\{payment\.deposited_to_account_id/.test(src)) {
  console.error("FAIL: expected EntityLink kind=account for deposited_to_account_id");
  process.exit(1);
}
console.log("verify-acct-payment-deposit-entitylink — OK");
