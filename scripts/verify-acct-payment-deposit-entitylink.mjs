#!/usr/bin/env node
import fs from "node:fs";
const p = "apps/frontend/src/pages/accounting/PaymentDetailPage.tsx";
function assertDepositEntityLink(src) {
  const i = src.indexOf("deposited_to_account_id");
  if (i < 0) throw new Error("deposited_to_account_id not found");

  // Scope the assertion to the payment deposit field, so other real bank-account
  // links in the frontend remain valid.
  const field = src.slice(Math.max(0, i - 200), i + 250);
  if (/EntityLink kind="bank_account"[\s\S]{0,120}deposited_to_account_id/.test(field)) {
    throw new Error("deposit EntityLink still kind=bank_account (must be account / CoA)");
  }
  if (!/EntityLink kind="account" id=\{payment\.deposited_to_account_id/.test(field)) {
    throw new Error("expected EntityLink kind=account for deposited_to_account_id");
  }
}

const src = fs.readFileSync(p, "utf8");
try {
  assertDepositEntityLink(src);
  if (process.argv.includes("--selftest")) {
    const broken = src.replace(
      'EntityLink kind="account" id={payment.deposited_to_account_id',
      'EntityLink kind="bank_account" id={payment.deposited_to_account_id',
    );
    if (broken === src) throw new Error("selftest mutation was inert");
    try {
      assertDepositEntityLink(broken);
      throw new Error("selftest failed: corrected assertion accepted legacy bank_account link");
    } catch (error) {
      if (error.message.includes("selftest failed")) throw error;
    }
  }
  console.log("verify-acct-payment-deposit-entitylink — OK");
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
}
