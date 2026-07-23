#!/usr/bin/env node
/**
 * Guard: Accounting wave 19/22 — Receipts / Undeposited Funds / customer payment receipts leaf.
 * - Receipts subnav + mounted route (not ComingSoon)
 * - Receipts API includes customer payment proof attachments
 * - Undeposited Funds nav leaf + route
 * - Receive Payment deposit picker uses CoA UUIDs (no ops_checking)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};

const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const subnav = read("apps/frontend/src/pages/accounting/subnav-manifest.ts");
const manifest = read("apps/frontend/src/routes/manifest.tsx");
const receiptsPage = read("apps/frontend/src/pages/accounting/ReceiptsPage.tsx");
const receiptsRoutes = read("apps/backend/src/accounting/receipts.routes.ts");
const receiptsApi = read("apps/frontend/src/api/receipts.ts");
const ufPage = read("apps/frontend/src/pages/accounting/UndepositedFundsPage.tsx");
const modal = read("apps/frontend/src/pages/accounting/RecordPaymentModal.tsx");
const payments = read("apps/backend/src/accounting/payments.routes.ts");
const customerPayments = read("apps/backend/src/accounting/customer-payments.routes.ts");

if (!subnav.includes('label: "Receipts", path: "/accounting/receipts"')) {
  fail("SUBNAV_ITEMS must register Receipts at /accounting/receipts");
}
if (!subnav.includes('label: "Undeposited Funds", path: "/accounting/undeposited-funds"')) {
  fail("SUBNAV_ITEMS must register Undeposited Funds leaf");
}

if (!manifest.includes('path="/accounting/receipts"') || manifest.match(/path="\/accounting\/receipts"[\s\S]{0,120}ComingSoonPage/)) {
  fail("/accounting/receipts must mount ReceiptsPage, not ComingSoonPage");
}
if (!manifest.includes('path="/accounting/undeposited-funds"') || !manifest.includes("UndepositedFundsPage")) {
  fail("/accounting/undeposited-funds must mount UndepositedFundsPage");
}

if (receiptsPage.includes("<ComingSoonPage")) fail("ReceiptsPage must not render ComingSoonPage");
if (!receiptsPage.includes("Customer payments")) fail("ReceiptsPage filter must include customer payments");
if (!receiptsPage.includes('value="payment"')) fail("ReceiptsPage filter must include payment entity_type option");

if (!receiptsRoutes.includes("entity_type = 'payment'")) {
  fail("receipts.routes must join accounting.payments for customer payment proof");
}
if (!receiptsRoutes.includes("check_image") || !receiptsRoutes.includes("ach_confirmation")) {
  fail("receipts.routes must include payment proof attachment categories");
}
if (!receiptsRoutes.includes('type: "payment"')) {
  fail("receipts.routes must map payment source in API response");
}

if (!receiptsApi.includes('type: "payment"')) {
  fail("receipts.ts API types must include payment source");
}

if (!ufPage.includes("undeposited_funds") || !ufPage.includes("account-register")) {
  fail("UndepositedFundsPage must resolve UF role and deep-link account register");
}

if (modal.includes("ops_checking")) fail("RecordPaymentModal must not reference ops_checking");
if (!modal.includes("buildReceivePaymentDepositOptions")) fail("RecordPaymentModal deposit builder missing");
if (!modal.includes('createKind="account"')) fail("Deposited to must use ReferenceSelect createKind=account");

if (/\?\?\s*["']ops_checking["']/.test(payments) || /=\s*["']ops_checking["']/.test(payments)) {
  fail("payments.routes must not default deposited_to to ops_checking");
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

console.log("PASS: verify-acct-receipts-leaf");
