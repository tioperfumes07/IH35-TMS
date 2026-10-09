#!/usr/bin/env node
/**
 * @matrix-built {"modules":["accounting","banking"],"cols":["connectivity","reverse_link","qbo_chrome"],"leafRe":"^(accounting\\.parity\\.account_register|banking\\.bank_transactions)$","task":"BANK-F91152-CATEGORIZATION-JE-REVERSE","vertical":"column-wave"}
 * Rule-17 guard: bank categorization ↔ JE reverse drill (Law §9 / audit #3177 P-BANK P0).
 *
 * Locks:
 * 1. Account Register sourceRoute(bank_categorization) → /banking/transactions?txn_id=
 * 2. JE detail consumes GET …/source-links and EntityLinks bank_categorization → bank_transaction
 * 3. Bank register exposes matched_journal_entry_id and EntityLink kind=journal_entry
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-categorization-je-reverse";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertBankCategorizationJeReverse() {
  const errors = [];
  const registerPage = read("apps/frontend/src/pages/accounting/AccountRegisterPage.tsx");
  const jeDetail = read("apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx");
  const api = read("apps/frontend/src/api/accounting.ts");
  const bankingApi = read("apps/frontend/src/api/banking.ts");
  const bankingView = read("apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx");
  const plaidRoutes = read("apps/backend/src/integrations/plaid/link.routes.ts");
  const jeRoutes = read("apps/backend/src/accounting/journal-entries.routes.ts");
  const registerService = read("apps/backend/src/accounting/account-register.service.ts");

  if (!/\/api\/v1\/accounting\/journal-entries\/:id\/source-links/.test(jeRoutes)) {
    errors.push("backend: journal-entries source-links route must remain mounted");
  }
  if (!/export function getJournalEntrySourceLinks\(/.test(api)) {
    errors.push("api: getJournalEntrySourceLinks client missing");
  }
  if (!/getJournalEntrySourceLinks/.test(jeDetail)) {
    errors.push("JournalEntryDetailPage: must call getJournalEntrySourceLinks");
  }
  if (!/Source links|source-links|journal-entry-source-links/.test(jeDetail)) {
    errors.push("JournalEntryDetailPage: must render Source links UI");
  }
  if (!/EntityLink/.test(jeDetail)) {
    errors.push("JournalEntryDetailPage: must render EntityLink for source drill-through");
  }
  if (!/case ["']bank_categorization["']/.test(jeDetail) || !/return ["']bank_transaction["']/.test(jeDetail)) {
    errors.push("JournalEntryDetailPage: bank_categorization must map to EntityLink kind bank_transaction");
  }
  if (
    !/t === ["']bank_categorization["'] && reference\)\s*return [`'"]\/banking\/transactions\?txn_id=\$\{reference\}[`'"]/.test(
      registerPage
    )
  ) {
    errors.push("AccountRegisterPage: sourceRoute(bank_categorization) must deep-link bank txn");
  }
  // BANK-F91152 / QBO: bank_categorization surfaces as Expense (money OUT) or Deposit (money IN) —
  // never a third "Bank Categorization" type. TYPE_LABELS default + buildRegisterRows direction both count.
  if (
    !/bank_categorization:\s*["']Expense["']/.test(registerService) &&
    !/bank_categorization:\s*["']Deposit["']/.test(registerService) &&
    !/bank_categorization:\s*["']Bank Categorization["']/.test(registerService)
  ) {
    errors.push("account-register.service: must label bank_categorization rows (Expense/Deposit or legacy)");
  }
  if (
    !/bank_is_credit === true[\s\S]{0,80}?"Deposit"[\s\S]{0,80}?"Expense"/.test(registerService) &&
    !/bank_is_credit === true\s*\?\s*"Deposit"\s*:\s*"Expense"/.test(registerService) &&
    !/bank_categorization:\s*["']Bank Categorization["']/.test(registerService)
  ) {
    errors.push("account-register.service: bank_categorization must resolve Deposit (is_credit) or Expense (money-out)");
  }
  if (!/matched_journal_entry_id/.test(bankingApi)) {
    errors.push("banking.ts: PlaidBankTransaction must expose matched_journal_entry_id");
  }
  if (!/bt\.matched_journal_entry_id::text AS matched_journal_entry_id/.test(plaidRoutes)) {
    errors.push("plaid company-transactions: SELECT must return matched_journal_entry_id");
  }
  if (!/kind=["']journal_entry["']/.test(bankingView) || !/matched_journal_entry_id/.test(bankingView)) {
    errors.push("BankingTransactionsDesignView: must EntityLink journal_entry when matched_journal_entry_id set");
  }
  return errors;
}

function selftest() {
  const errors = assertBankCategorizationJeReverse();
  if (errors.length) {
    console.error(`${LABEL} SELFTEST FAILED — live sources rejected: ${errors.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertBankCategorizationJeReverse();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
