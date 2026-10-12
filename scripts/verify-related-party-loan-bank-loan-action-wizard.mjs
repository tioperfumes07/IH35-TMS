#!/usr/bin/env node
/**
 * 18364 — ROUND 443.22-2a Bank Categorize "Loan" → existing LoanApplicationWizard @ 4% APR.
 *
 * Asserts: expand radio includes Loan; opens LoanApplicationWizard with bank prefill; default
 * interest is 4%; create accepts bank_transaction_id and stamps matched_related_party_loan_id;
 * bank SELECT/UPDATE uses voided_at (not deleted_at); never silent-mints from categorize.
 *
 * Run: node scripts/verify-related-party-loan-bank-loan-action-wizard.mjs [--selftest]
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-related-party-loan-bank-loan-action-wizard";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const FILES = {
  designView: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
  wizard: "apps/frontend/src/pages/accounting/loans/LoanApplicationWizard.tsx",
  qbo: "apps/frontend/src/design/qbo-parity.ts",
  feApi: "apps/frontend/src/api/related-party-loans.ts",
  createEntry: "apps/backend/src/accounting/related-party-loan-posting/create-entry.service.ts",
  routes: "apps/backend/src/accounting/related-party-loan-posting/routes.ts",
  glPost: "apps/backend/src/banking/bank-feed-gl-posting.service.ts",
};

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function fail(errors) {
  console.error(`${LABEL} FAILED:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

export function staticProblems(srcs) {
  const errors = [];
  const { designView, wizard, qbo, feApi, createEntry, routes, glPost } = srcs;

  // F1 — QBO parity label
  if (!qbo.includes('loan: "Loan"')) {
    errors.push('F1: qbo-parity missing QBO_BANKING_ACTIONS.loan = "Loan"');
  }

  // F2 — DesignView Loan radio + wizard mount (2d: debit labels Apply repayment via same modeId)
  if (
    !designView.includes('["loan", QBO_BANKING_ACTIONS.loan]') &&
    !(designView.includes('"loan"') && designView.includes("QBO_BANKING_ACTIONS.loan") && designView.includes("QBO_BANKING_ACTIONS.applyRepayment"))
  ) {
    errors.push("F2: BankingTransactionsDesignView must expose Loan expand radio");
  }
  if (!designView.includes("banking-expand-mode-${modeId}") || !designView.includes('modeId === "loan"')) {
    errors.push("F2: Loan mode must set loan modal from expand radio");
  }
  if (!designView.includes("LoanApplicationWizard") || !designView.includes("setLoanModalTx")) {
    errors.push("F2: DesignView must mount LoanApplicationWizard via loanModalTx");
  }
  if (!designView.includes("BANK_LOAN_DEFAULT_INTEREST_PCT")) {
    errors.push("F2: Loan prefill must seed 4% default interest");
  }
  // ROUND 443.22-2d: credit → bank_funding; debit → bank_repayment (still requires bank_funding on credit).
  if (
    !designView.includes('"bank_funding"') ||
    !(
      designView.includes('target_type: "bank_funding"') ||
      designView.includes('is_credit ? "bank_funding" : "bank_repayment"')
    )
  ) {
    errors.push("F2: Loan prefill must seed bank_funding on credit (debit may be bank_repayment)");
  }
  if (!designView.includes("bank_transaction_id: loanModalTx.id")) {
    errors.push("F2: Loan prefill must pass bank_transaction_id for reverse pointer");
  }

  // F3 — wizard: 4% default, bank banner, payload carries bank_transaction_id
  if (!wizard.includes('BANK_LOAN_DEFAULT_INTEREST_PCT = "4"')) {
    errors.push('F3: wizard missing BANK_LOAN_DEFAULT_INTEREST_PCT = "4"');
  }
  if (!wizard.includes("loan-wizard-bank-prefill-banner")) {
    errors.push("F3: wizard must show bank-prefill banner (confirm every time)");
  }
  if (!wizard.includes("bank_transaction_id") || !wizard.includes("formFromPrefill")) {
    errors.push("F3: wizard must accept prefill.bank_transaction_id and seed form");
  }
  if (!wizard.includes('target_type: prefill.target_type ?? (prefill.bank_transaction_id ? "bank_funding"')) {
    errors.push("F3: bank-seeded wizard must default target_type bank_funding");
  }

  // F4 — FE API + create-entry.service stamp reverse pointer with voided_at
  if (!feApi.includes("bank_transaction_id")) {
    errors.push("F4: CreateRelatedPartyLoanRequest must carry bank_transaction_id");
  }
  if (!routes.includes("bank_transaction_id")) {
    errors.push("F4: routes schema must accept bank_transaction_id");
  }
  if (!createEntry.includes("bank_transaction_id") || !createEntry.includes("matched_related_party_loan_id")) {
    errors.push("F4: create-entry.service must accept bank_transaction_id and stamp matched_related_party_loan_id");
  }
  if (!createEntry.includes("voided_at IS NULL")) {
    errors.push("F4: bank SELECT/UPDATE must filter voided_at IS NULL (column is not deleted_at)");
  }
  if (createEntry.includes("deleted_at IS NULL") && createEntry.includes("bank_transactions")) {
    // Narrow: fail if bank_transactions queries still use deleted_at
    const bankBlocks = createEntry.split("banking.bank_transactions");
    for (let i = 1; i < bankBlocks.length; i++) {
      const chunk = bankBlocks[i].slice(0, 400);
      if (chunk.includes("deleted_at IS NULL")) {
        errors.push("F4: banking.bank_transactions must not filter deleted_at — use voided_at");
        break;
      }
    }
  }
  if (!createEntry.includes("document_kind") || !createEntry.includes('"funding"')) {
    errors.push("F4: create must set document_kind funding for bank_funding / bank_transaction_id");
  }

  // F5 — never silent-mint from categorize
  if (glPost.includes("ensureRelatedPartyLoanDocumentFromBankCategorize")) {
    errors.push("F5: bank-feed-gl-posting must NOT silent-mint loans — confirm via Loan wizard");
  }

  return errors;
}

function selftest() {
  const good = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
  const ok = staticProblems(good);
  if (ok.length) fail(["selftest expected PASS on live tree:", ...ok]);

  const broken = {
    ...good,
    wizard: good.wizard.replace('BANK_LOAN_DEFAULT_INTEREST_PCT = "4"', 'BANK_LOAN_DEFAULT_INTEREST_PCT = "0"'),
  };
  const bad = staticProblems(broken);
  if (!bad.some((e) => e.startsWith("F3:"))) {
    fail(["selftest expected F3 failure when 4% default is stripped"]);
  }
  console.log(`${LABEL} selftest OK`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  for (const rel of Object.values(FILES)) {
    if (!existsSync(join(ROOT, rel))) fail([`missing required file ${rel}`]);
  }
  const srcs = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
  const errors = staticProblems(srcs);
  if (errors.length) fail(errors);
  console.log(`${LABEL} OK`);
}

main();
