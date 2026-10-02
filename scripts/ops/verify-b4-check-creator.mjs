#!/usr/bin/env node
/**
 * B-4 CHECK CREATOR + BILL PAYMENT — ORDERS-2026-10-01-BANKING-REGISTER-SET §9/§10/§13–§15.
 * Asserts QBO Write Check chrome on the existing engine: Who did you pay?, Add to Check /
 * Outstanding Transactions, Restore draft, Order checks, Make recurring (honest disabled).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-b4-check-creator";

const FORM = "apps/frontend/src/components/checks/WriteCheckForm.tsx";
const CREATE = "apps/frontend/src/pages/accounting/checks/CheckCreatePage.tsx";
const TOPBAR = "apps/frontend/src/components/Topbar.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertIncludes(src, needle, where) {
  if (!src.includes(needle)) throw new Error(`${where}: missing ${JSON.stringify(needle)}`);
}

function main() {
  const form = read(FORM);
  const create = read(CREATE);
  const topbar = read(TOPBAR);

  assertIncludes(form, 'data-b4-check-creator="1"', FORM);
  assertIncludes(form, 'data-b4-who-did-you-pay="1"', FORM);
  assertIncludes(form, "Who did you pay?", FORM);
  assertIncludes(form, 'data-b4-add-to-check="1"', FORM);
  assertIncludes(form, "Add to Check", FORM);
  assertIncludes(form, "Outstanding Transactions", FORM);
  assertIncludes(form, 'label: "Open balance"', FORM);
  assertIncludes(form, 'label: "Payment"', FORM);
  assertIncludes(form, 'data-b4-amount-to-apply="1"', FORM);
  assertIncludes(form, "Amount to Apply:", FORM);
  // BANK-F91033 — Amount to Credit is live (typed Payment above open balance); Save blocked while credit > 0
  assertIncludes(form, 'data-b4-amount-to-credit="1"', FORM);
  assertIncludes(form, "Amount to Credit:", FORM);
  assertIncludes(form, "billPaymentCreditCents", FORM);
  assertIncludes(form, "billPaymentApplyCents", FORM);
  assertIncludes(form, "formatMoneyCents(billPaymentCreditCents)", FORM);
  assertIncludes(form, "formatMoneyCents(billPaymentApplyCents)", FORM);
  assertIncludes(form, 'data-testid="b4-amount-to-credit"', FORM);
  assertIncludes(form, "billPaymentCreditCents === 0", FORM);
  if (form.includes("Amount to Credit: <strong>$0.00</strong>")) {
    throw new Error(`${FORM}: Amount to Credit must not be a hardcoded $0.00 stub`);
  }
  // BANK-F91029 — Clear Payment is a real button; Add all + Open on open-bill cards (ORDERS §B-4 / spec §9–§10)
  assertIncludes(form, 'data-b4-clear-payment="1"', FORM);
  assertIncludes(form, "Clear Payment", FORM);
  assertIncludes(form, "clearBillPayments", FORM);
  assertIncludes(form, 'data-b4-add-all="1"', FORM);
  assertIncludes(form, "Add all", FORM);
  assertIncludes(form, "addAllOpenBillsToPay", FORM);
  assertIncludes(form, 'data-b4-open-bill="1"', FORM);
  assertIncludes(form, 'to={`/accounting/bills/${b.id}`}', FORM);
  if (!/<button[\s\S]*data-b4-clear-payment="1"[\s\S]*Clear Payment[\s\S]*<\/button>/.test(form)) {
    throw new Error(`${FORM}: Clear Payment must be a <button>, not a dead span`);
  }
  // BANK-F91032 — Find Bill No. filters Outstanding Transactions / Add to Check (ORDERS §B-4 / QBO §10)
  assertIncludes(form, 'data-b4-find-bill-no="1"', FORM);
  assertIncludes(form, "Find Bill No.", FORM);
  assertIncludes(form, "billFindQuery", FORM);
  assertIncludes(form, "billMatchesFind", FORM);
  assertIncludes(form, "openBillsNotQueued", FORM);
  assertIncludes(form, 'data-testid="b4-find-bill-no"', FORM);
  assertIncludes(form, 'data-b4-restore-draft="1"', FORM);
  assertIncludes(form, "You have a draft saved. Restore draft", FORM);
  assertIncludes(form, "checkDraftStorageKey", FORM);
  assertIncludes(form, 'data-b4-order-checks="1"', FORM);
  assertIncludes(form, "Order checks", FORM);
  assertIncludes(form, 'data-b4-make-recurring="1"', FORM);
  assertIncludes(form, "Make recurring", FORM);
  assertIncludes(form, "Print later", FORM);
  assertIncludes(form, "Save and close", FORM);
  assertIncludes(form, "payCheckBills", FORM);
  assertIncludes(form, "createCheck", FORM);

  assertIncludes(create, "WriteCheckForm", CREATE);
  assertIncludes(create, "/accounting/checks/new", CREATE);

  assertIncludes(topbar, "/accounting/checks/new", TOPBAR);
  assertIncludes(topbar, "create_check", TOPBAR);

  console.log(`${LABEL}: PASS`);
}

function selftest() {
  try {
    main();
  } catch (err) {
    console.error(`${LABEL}: SELFTEST FAIL — ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
