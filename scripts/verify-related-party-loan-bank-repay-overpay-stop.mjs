#!/usr/bin/env node
/**
 * 18368 — ROUND 443.22-2d Bank money-OUT → Apply repayment; STOP if overpay.
 *
 * Asserts: debit Loan radio labels Apply repayment and prefills bank_repayment (not bank_funding);
 * create route refuses principal > facility open_balance_cents; wizard shows open balance and
 * blocks submit on overpay; facility.service exports getFacilityOpenBalanceCents.
 *
 * Run: node scripts/verify-related-party-loan-bank-repay-overpay-stop.mjs [--selftest]
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-related-party-loan-bank-repay-overpay-stop";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const FILES = {
  designView: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
  wizard: "apps/frontend/src/pages/accounting/loans/LoanApplicationWizard.tsx",
  qbo: "apps/frontend/src/design/qbo-parity.ts",
  routes: "apps/backend/src/accounting/related-party-loan-posting/routes.ts",
  facility: "apps/backend/src/accounting/related-party-loan-posting/facility.service.ts",
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
  const { designView, wizard, qbo, routes, facility } = srcs;

  // F1 — QBO label for Apply repayment
  if (!qbo.includes('applyRepayment: "Apply repayment"')) {
    errors.push('F1: qbo-parity missing QBO_BANKING_ACTIONS.applyRepayment = "Apply repayment"');
  }

  // F2 — DesignView: debit → Apply repayment + bank_repayment; credit still bank_funding
  if (!designView.includes("QBO_BANKING_ACTIONS.applyRepayment")) {
    errors.push("F2: DesignView must label debit Loan radio Apply repayment");
  }
  if (
    !designView.includes('target_type: loanModalTx.is_credit ? "bank_funding" : "bank_repayment"') &&
    !designView.includes('loanModalTx.is_credit ? "bank_funding" : "bank_repayment"')
  ) {
    errors.push("F2: Loan prefill must use bank_funding on credit and bank_repayment on debit");
  }
  if (!designView.includes('target_type: "bank_funding"') && !designView.includes('"bank_funding"')) {
    errors.push("F2: credit path must still seed bank_funding (2a must not regress)");
  }

  // F3 — wizard: open balance + overpay stop + repayment title
  if (!wizard.includes("isLoanRepaymentTarget") || !wizard.includes("loan-wizard-facility-open-balance")) {
    errors.push("F3: wizard must detect repayment target and show facility open balance");
  }
  if (!wizard.includes("loan-wizard-overpay-stop") || !wizard.includes("overpayBlocked")) {
    errors.push("F3: wizard must block submit when principal > facility open balance");
  }
  if (!wizard.includes("Apply loan repayment") || !wizard.includes("listRelatedPartyLoanFacilities")) {
    errors.push("F3: repayment mode must retitle wizard and load facilities");
  }
  if (!wizard.includes("Stop — do not overpay")) {
    errors.push("F3: overpay copy must say Stop — do not overpay");
  }

  // F4 — server refuse overpay
  if (!facility.includes("export async function getFacilityOpenBalanceCents")) {
    errors.push("F4: facility.service must export getFacilityOpenBalanceCents");
  }
  if (!routes.includes("getFacilityOpenBalanceCents") || !routes.includes("repayment_exceeds_facility_open_balance")) {
    errors.push("F4: create route must call getFacilityOpenBalanceCents and refuse overpay");
  }
  if (!routes.includes("documentKind === \"repayment\"") && !routes.includes("documentKind === 'repayment'")) {
    errors.push("F4: overpay gate must run for document_kind repayment (bank_repayment / repayment)");
  }
  if (!routes.includes("open_balance_cents") || !routes.includes("do not overpay")) {
    errors.push("F4: 400 response must carry open_balance_cents + plain-English overpay message");
  }

  return errors;
}

function selftest() {
  const good = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
  const ok = staticProblems(good);
  if (ok.length) fail(["selftest expected PASS on live tree:", ...ok]);

  const broken = {
    ...good,
    routes: good.routes.replaceAll("repayment_exceeds_facility_open_balance", "repayment_ok_always"),
  };
  const bad = staticProblems(broken);
  if (!bad.some((e) => e.startsWith("F4:"))) {
    fail(["selftest expected F4 failure when overpay refuse is stripped"]);
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
