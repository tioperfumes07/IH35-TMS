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
 * LEAD RULING 2026-10-17 15:10Z #1: "Work-order mode offers COST accounts only — exclude Income / OtherIncome
 * (ACCT-F92 stands). Bills Section A keeps the full CoA. Mode filter in the ONE shared picker source; guard."
 * 443.159 (#26794) had put Section A on the full chart in EVERY mode, so WO mode offered 4210-4240 Income again.
 * This guard now also requires: the helper exports scopeCostLineAccounts, WO mode scopes through isExpenseAccount,
 * bill mode returns the full chart, and the editor feeds its chart rows through scopeCostLineAccounts(…, mode).
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

/** The body of `export function <name>` (brace-matched), or null when absent. */
function functionBody(src, name) {
  const start = src.search(new RegExp(`export function ${name}\\b`));
  if (start < 0) return null;
  const open = src.indexOf("{", src.indexOf(")", start));
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
  }
  return null;
}

export function analyse(files) {
  const problems = [];
  const helper = files[HELPER];
  if (helper == null) {
    problems.push(`${HELPER} is missing — the shared picker-scope definition is gone.`);
  } else {
    for (const fn of ["isPaymentAccount", "isExpenseAccount", "scopeCostLineAccounts"]) {
      if (!new RegExp(`export function ${fn}`).test(helper)) {
        problems.push(`${HELPER} no longer exports ${fn}.`);
      }
    }
    // LEAD RULING 2026-10-17 #1: the mode decision itself — WO = cost only, bill = full chart.
    const scopeBody = functionBody(stripComments(helper), "scopeCostLineAccounts");
    if (scopeBody != null) {
      if (!/mode\s*===\s*["']wo["'][^;]*\.filter\(\s*isExpenseAccount\s*\)/.test(scopeBody)) {
        problems.push(
          `${HELPER}: scopeCostLineAccounts no longer filters work-order mode through isExpenseAccount. WO mode must ` +
            `offer COST accounts only — never 4210-4240 Detention/Layover/Lumper/TONU Income (ACCT-F92, lead 2026-10-17 #1).`
        );
      }
      // Exactly ONE filter — the work-order branch. A second one narrows bill/expense mode too.
      if ((scopeBody.match(/\.filter\(/g) ?? []).length > 1) {
        problems.push(
          `${HELPER}: scopeCostLineAccounts narrows bill mode. Bills Section A keeps the FULL chart (owner 443.159); ` +
            `only work-order mode is scoped.`
        );
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
  } else {
    // 443.159 (747999d9fb, #26794 — owner 2026-10-16: "all accounts must appear when creating a bill, any
    // type of bill … same picker as Banking, all uniform") superseded the ACCT-F92 expense-only scope on
    // this editor: Section A now lists the full active Chart of Accounts from getCoaAccounts — the exact list
    // Banking categorize shows — in bill, expense and work-order mode. The one-definition rule this guard
    // exists for still holds: the editor must read that ONE source, and any account-type scope on it must
    // come from the shared helper, never a hand-rolled inline type test (how ACCT-F92's two pickers drifted).
    if (!/getCoaAccounts\(operatingCompanyId\)/.test(editor)) {
      problems.push(
        `${LINE_EDITOR}: the cost-line Section A picker no longer reads the one Chart of Accounts source ` +
          `(getCoaAccounts) that Banking categorize uses (443.159).`
      );
    }
    if (!/scopeCostLineAccounts\(\s*\w+\s*,\s*mode\s*\)/.test(editor)) {
      problems.push(
        `${LINE_EDITOR}: Section A does not feed its chart rows through scopeCostLineAccounts(…, mode). Without it ` +
          `work-order mode offers the full chart incl. 4210-4240 Income (lead 2026-10-17 #1; ACCT-F92 stands).`
      );
    }
    if (/account_type\s*[!=]==/.test(editor) || /account_subtype\s*[!=]==/.test(editor)) {
      problems.push(
        `${LINE_EDITOR}: hand-rolled inline account-type filter on the cost-line picker. Scope only through ` +
          `lib/account-picker-scope.ts so a fix to one picker cannot leave another behind.`
      );
    }
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
  // The real helper shape (lib/account-picker-scope.ts) — WO filtered through isExpenseAccount, bill/expense full chart.
  const goodScope =
    "export function scopeCostLineAccounts<T extends PickerAccount>(accounts: readonly T[], mode: CostLinePickerMode): T[] {\n" +
    '  if (mode === "wo") return accounts.filter(isExpenseAccount);\n  return [...accounts];\n}';
  const goodHelper = "export function isPaymentAccount(a){} export function isExpenseAccount(a){}\n" + goodScope;
  const goodExpense = ".filter(isPaymentAccount)\n.filter(isExpenseAccount)";
  const goodEditor =
    "queryFn: () => getCoaAccounts(operatingCompanyId)\nconst fromCoa = scopeCostLineAccounts(chartRows, mode).map((a) => ({ id: a.id }))";
  const run = (o) => analyse({ [HELPER]: goodHelper, [EXPENSE_FORM]: goodExpense, [LINE_EDITOR]: goodEditor, ...o });

  t("all scoped passes", run({}).length === 0);
  // The REAL pre-fix payment filter.
  t("inline Asset test FAILS", run({ [EXPENSE_FORM]: '.filter((a) => a.account_type === "Asset")' }).length === 2);
  // 443.159: the cost-line picker must read the one chart source Banking uses.
  t("cost-line picker off the shared chart source FAILS",
    run({ [LINE_EDITOR]: "scopeCostLineAccounts(chartRows, mode).map((a) => ({ id: a.id }))" }).length === 1);
  // The drift shape ACCT-F92 named: an inline type test instead of the shared helper.
  t("inline account_type test on the cost-line picker FAILS",
    run({ [LINE_EDITOR]: goodEditor + '\n.filter((a) => a.account_type !== "Income")' }).length === 1);
  // LEAD 2026-10-17 #1 — the REAL pre-fix editor (747999d9fb / #26794): the full chart mapped in every mode.
  t("editor maps the full chart with no mode scope (origin/main shape) FAILS",
    run({ [LINE_EDITOR]: "queryFn: () => getCoaAccounts(operatingCompanyId)\nconst fromCoa = (coaAccountsQuery.data?.accounts ?? []).map((account) => ({ id: account.id }))" }).length === 1);
  t("editor scopes with a hard-coded mode (not its own mode prop) FAILS",
    run({ [LINE_EDITOR]: 'getCoaAccounts(operatingCompanyId)\nscopeCostLineAccounts(chartRows, "bill").map((a) => a)' }).length === 1);
  t("helper stops exporting scopeCostLineAccounts FAILS",
    run({ [HELPER]: "export function isPaymentAccount(a){} export function isExpenseAccount(a){}" }).length === 1);
  t("WO mode not filtered through isExpenseAccount FAILS",
    run({ [HELPER]: goodHelper.replace(".filter(isExpenseAccount)", ".filter((a) => a.is_postable)") }).length === 1);
  t("WO mode returns the full chart FAILS",
    run({ [HELPER]: goodHelper.replace('if (mode === "wo") return accounts.filter(isExpenseAccount);', "") }).length === 1);
  t("bill mode narrowed too FAILS",
    run({ [HELPER]: goodHelper.replace("return [...accounts];", "return accounts.filter(isExpenseAccount);") }).length === 1);
  t("helper missing FAILS", run({ [HELPER]: null }).length === 1);
  t("the fix's own explanatory comment does NOT trip it",
    run({ [EXPENSE_FORM]: '// was account_type === "Asset" before\n.filter(isPaymentAccount)\n.filter(isExpenseAccount)',
      [LINE_EDITOR]: goodEditor + '\n// WO used to offer account_type === "Income" rows' }).length === 0);
  t("helper stops exporting isPaymentAccount FAILS",
    run({ [HELPER]: "export function isExpenseAccount(a){}\n" + goodScope }).length === 1);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 13 cases (2 pass-shapes incl. comment-immunity, 11 fail-shapes incl. the real payment defect and the real #26794 full-chart-in-WO editor)`);
  process.exit(0);
}
const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — payment picker scoped through the shared helper; cost-line picker reads the one Chart of Accounts source (443.159) scoped by mode through scopeCostLineAccounts (WO = cost only, bill = full chart) with no inline type test`);
