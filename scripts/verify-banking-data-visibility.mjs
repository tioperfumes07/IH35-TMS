#!/usr/bin/env node
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function fail(message) {
  console.error(`✘ ${message}`);
  process.exit(1);
}

const transactionsView = read("apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx");
if (transactionsView.includes("limit: 300")) {
  fail("Banking transactions view still contains fixed 300-row limit.");
}
if (!transactionsView.includes("COMPANY_TRANSACTIONS_PAGE_SIZE = 500")) {
  fail("Banking transactions view is missing paged full-fetch constant.");
}
if (!transactionsView.includes("tx.bank_account_id === selectedAccount.id")) {
  fail("Bank account chip filter is not enforcing account-specific rows.");
}

const bankingHome = read("apps/frontend/src/pages/banking/BankingHome.tsx");
if (!bankingHome.includes("bankAccountsPanelRows")) {
  fail("Banking Home is missing bank accounts fallback row builder.");
}
if (!bankingHome.includes("plaidAccountsQuery.data?.accounts")) {
  fail("Banking Home fallback does not source Plaid accounts.");
}

console.log("✅ Banking data visibility guard passed");
