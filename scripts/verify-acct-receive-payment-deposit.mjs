#!/usr/bin/env node
/**
 * Guard: Receive Payment deposit must be catalogs.accounts UUID — never "ops_checking".
 * Accounting PR 7/M.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};

const modal = fs.readFileSync(path.join(root, "apps/frontend/src/pages/accounting/RecordPaymentModal.tsx"), "utf8");
const payments = fs.readFileSync(path.join(root, "apps/backend/src/accounting/payments.routes.ts"), "utf8");
const customerPayments = fs.readFileSync(path.join(root, "apps/backend/src/accounting/customer-payments.routes.ts"), "utf8");

if (modal.includes("ops_checking")) fail("RecordPaymentModal must not reference ops_checking");
if (!modal.includes('createKind="account"')) fail("Deposited to must use ReferenceSelect createKind=account");
if (!modal.includes("receive-payment-deposit-to")) fail("deposit picker testid missing");
if (!modal.includes("buildReceivePaymentDepositOptions")) fail("deposit option builder missing");
if (!modal.includes("getAllAccounts") || !modal.includes("getCoaAccounts") || !modal.includes("listCoaRoles")) {
  fail("deposit catalog must load banks + CoA + coa-roles");
}

if (/\?\?\s*["']ops_checking["']/.test(payments) || /=\s*["']ops_checking["']/.test(payments)) {
  fail("payments.routes must not default deposited_to to ops_checking");
}
if (!payments.includes("deposited_to_account_id: z.string().uuid()")) {
  fail("payments create schema must require uuid for deposited_to_account_id");
}
if (!payments.includes("resolveRoleAccountOptional")) {
  fail("payments.routes must resolve UF/cash_clearing via coa-roles resolver");
}

if (/\?\?\s*["']ops_checking["']/.test(customerPayments) || /=\s*["']ops_checking["']/.test(customerPayments)) {
  fail("customer-payments.routes must not store ops_checking");
}
if (!customerPayments.includes("ledger_account_id")) {
  fail("customer-payments must bridge bank_account_id → ledger_account_id");
}
if (!customerPayments.includes("resolveRoleAccountOptional")) {
  fail("customer-payments must resolve UF/cash_clearing via coa-roles resolver");
}

// Soft-resolve of legacy deposit slugs in posting-engine is a separate HOLD PR
// (touches *posting* → JORGE-APPROVED). This guard locks write-path + UI only.

console.log("PASS: verify-acct-receive-payment-deposit");
