#!/usr/bin/env node
/**
 * GUARD — ACCT-F92 account-picker type scoping.
 *
 * THE DEFECT (live, 2026-08-02):
 *  - /accounting/expenses "Payment account *" is labelled "Select bank/cash account…" but filtered
 *    only on `account_type === "Asset"`. On prod that type also contains Accumulated Depreciation,
 *    Trucks & Tractors, Trailers, Prepaid Expenses, Inventory, Accounts Receivable, Unbilled Revenue,
 *    Factoring Reserves, Driver Cash Advances and three Inter-company accounts — so an expense could
 *    be recorded as paid FROM depreciation. Measured: TRANSP 52 accounts offered, USMCA 18.
 *  - The Work Order "Parts & Labor > Type" picker had NO type filter at all and offered the full
 *    chart, including 4210-4240 Detention/Layover/Lumper/TONU INCOME and the Inter-company accounts,
 *    as cost categories.
 * Both entries still BALANCE, so no downstream check catches them — only the picker can.
 *
 * WHAT IT ENFORCES: both pickers derive their options from the SHARED helper
 * (lib/account-picker-scope.ts), never a hand-rolled inline type test. One definition, so a fix to one
 * surface cannot leave the other behind — which is exactly how these two drifted apart.
 */
import { readFileSync, existsSync } from "node:fs";

const LABEL = "verify:account-picker-type-scope";
const HELPER = "apps/frontend/src/lib/account-picker-scope.ts";
const EXPENSE_FORM = "apps/frontend/src/components/expenses/RecordExpenseForm.tsx";
const LINE_EDITOR = "apps/frontend/src/components/forms/TwoSectionLineEditor.tsx";

/** The exact hand-rolled test that shipped the payment-account defect. */
const INLINE_ASSET_TEST = /account_type\s*===\s*["']Asset["']/;

/**
 * Strip // line comments and block comments before scanning.
 *
 * Without this the guard fired on its own fix: the code comment explaining the defect QUOTES
 * `account_type === "Asset"`, and a naive scan cannot tell prose from a predicate. Rewording the
 * comment to dodge the scanner would have been the wrong fix — the explanation is the most valuable
 * part of that file, and a guard that forces you to write around it is a guard people learn to
 * weaken. Scan code; leave prose alone.
 */
function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function analyse(files) {
  const problems = [];
  const helper = files[HELPER];
  if (helper == null) {
    problems.push(`${HELPER} is missing — the shared picker-scope definition is gone.`);
  } else {
    for (const fn of ["isPaymentAccount", "isExpenseAccount"]) {
      if (!new RegExp(`export function ${fn}`).test(helper)) {
        problems.push(`${HELPER} no longer exports ${fn}.`);
      }
    }
  }

  const expenseRaw = files[EXPENSE_FORM];
  const expense = expenseRaw == null ? null : stripComments(expenseRaw);
  if (expense == null) {
    problems.push(`${EXPENSE_FORM} is missing.`);
  } else {
    if (!/isPaymentAccount/.test(expense)) {
      problems.push(
        `${EXPENSE_FORM}: the Payment account picker does not use isPaymentAccount. Without it the ` +
          `field offers every Asset — Accumulated Depreciation, Trucks, Prepaid, A/R, Unbilled Revenue ` +
          `— as an account an expense was paid FROM.`
      );
    }
    if (INLINE_ASSET_TEST.test(expense)) {
      problems.push(
        `${EXPENSE_FORM}: still contains an inline \`account_type === "Asset"\` filter. That is the ` +
          `exact test that produced this defect; scope through the shared helper instead.`
      );
    }
  }

  const editorRaw = files[LINE_EDITOR];
  const editor = editorRaw == null ? null : stripComments(editorRaw);
  if (editor == null) {
    problems.push(`${LINE_EDITOR} is missing.`);
  } else if (!/isExpenseAccount/.test(editor)) {
    problems.push(
      `${LINE_EDITOR}: the expense/work-order cost-line picker does not use isExpenseAccount. Without ` +
        `it the WO "Type" list offers REVENUE (Detention/Layover/Lumper/TONU Income) and Inter-company ` +
        `accounts as cost categories.`
    );
  }

  return problems;
}

function readAll() {
  const out = {};
  for (const f of [HELPER, EXPENSE_FORM, LINE_EDITOR]) out[f] = existsSync(f) ? readFileSync(f, "utf8") : null;
  return out;
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };
  const goodHelper = "export function isPaymentAccount(a){} export function isExpenseAccount(a){}";
  const goodExpense = ".filter(isPaymentAccount)\n.filter(isExpenseAccount)";
  const goodEditor = ".filter(isExpenseAccount)";

  t("all scoped passes", analyse({ [HELPER]: goodHelper, [EXPENSE_FORM]: goodExpense, [LINE_EDITOR]: goodEditor }).length === 0);
  // The REAL pre-fix payment filter.
  t("inline Asset test FAILS",
    analyse({ [HELPER]: goodHelper, [EXPENSE_FORM]: '.filter((a) => a.account_type === "Asset")', [LINE_EDITOR]: goodEditor }).length === 2);
  // The REAL pre-fix WO picker: no filter at all.
  t("unfiltered cost-line picker FAILS",
    analyse({ [HELPER]: goodHelper, [EXPENSE_FORM]: goodExpense, [LINE_EDITOR]: "accounts.map((a) => ({ id: a.id }))" }).length === 1);
  t("helper missing FAILS", analyse({ [HELPER]: null, [EXPENSE_FORM]: goodExpense, [LINE_EDITOR]: goodEditor }).length === 1);
  t("the fix's own explanatory comment does NOT trip it",
    analyse({ [HELPER]: goodHelper, [EXPENSE_FORM]: '// was account_type === "Asset" before\n.filter(isPaymentAccount)\n.filter(isExpenseAccount)', [LINE_EDITOR]: goodEditor }).length === 0);
  t("helper stops exporting isPaymentAccount FAILS",
    analyse({ [HELPER]: "export function isExpenseAccount(a){}", [EXPENSE_FORM]: goodExpense, [LINE_EDITOR]: goodEditor }).length === 1);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 6 cases (2 pass-shapes incl. comment-immunity, 4 fail-shapes incl. both real defects)`);
  process.exit(0);
}
const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — payment and cost-line pickers both scoped through the shared helper`);
