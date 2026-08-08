#!/usr/bin/env node
/**
 * GUARD (live-defect 2026-07-12): the Bill (vendor-bill Section-A) and Expense create-form "Category"
 * selectors MUST source their options from the FULL Chart-of-Accounts — the SAME source the banking
 * categorize screen uses — so users can pick an EXISTING account instead of being forced to "+ Create"
 * duplicate COA accounts (a real daily-use bug + a bill-posting blocker).
 *
 * The sibling verify-referenceselect-coverage-ratchet guards the WIDGET (ReferenceSelect + inline add).
 * THIS guard covers the DATA SOURCE (the actual defect): the category options must come from the full COA
 * (getCoaAccounts / listCatalogAccounts .accounts), not the limited accounting-categories / expense_categories
 * list alone.
 *
 * --selftest exercises the assertions against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const BILL = path.join(root, "apps/frontend/src/components/forms/TwoSectionLineEditor.tsx");
const EXPENSE = path.join(root, "apps/frontend/src/components/expenses/RecordExpenseForm.tsx");

function assertBill(src) {
  const errors = [];
  // Must fetch the full COA (getCoaAccounts) and feed expenseCategoryOptions from coaAccountsQuery.
  if (!/getCoaAccounts/.test(src)) errors.push("TwoSectionLineEditor: does not import/use getCoaAccounts (full COA)");
  if (!/coaAccountsQuery\.data\?\.accounts/.test(src)) errors.push("TwoSectionLineEditor: expenseCategoryOptions is not sourced from the full COA (coaAccountsQuery.data.accounts)");
  return errors;
}
function assertExpense(src) {
  const errors = [];
  // categoryOptions must be sourced from the full catalog accounts (paymentAccountsQuery.data.accounts), not
  // ONLY costContextQuery.expense_categories.
  if (!/categoryOptions[\s\S]{0,400}paymentAccountsQuery\.data\?\.accounts/.test(src)) {
    errors.push("RecordExpenseForm: categoryOptions is not sourced from the full COA (paymentAccountsQuery.data.accounts)");
  }
  // LV-EXPENSE-CATEGORY-PICKER-EMPTY-RC: Category ReferenceSelect must pass loading= from the CoA query
  // so Combobox suppresses "+ Add new category" during fetch (otherwise operators mint duplicate accounts).
  const categoryBlock = src.match(/createKind=["']category["'][\s\S]{0,600}/);
  if (!categoryBlock) {
    errors.push("RecordExpenseForm: Category ReferenceSelect createKind=\"category\" not found");
  } else if (!/loading=\{[^}]*paymentAccountsQuery\.(isLoading|isFetching)/.test(categoryBlock[0])) {
    errors.push(
      "RecordExpenseForm: Category ReferenceSelect must pass loading={paymentAccountsQuery.isLoading|isFetching} " +
        "so Combobox hides + Add new during CoA fetch (LV-EXPENSE-CATEGORY-PICKER-EMPTY-RC)"
    );
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const billGood = "import { getCoaAccounts } from '../../api/banking';\nconst x = coaAccountsQuery.data?.accounts ?? [];";
  const billBad = "const fromAccounting = accountingCategoriesQuery.data;";
  const expGood =
    "const categoryOptions = useMemo(() => { const c = paymentAccountsQuery.data?.accounts ?? []; });\n" +
    '<ReferenceSelect createKind="category" loading={paymentAccountsQuery.isLoading || paymentAccountsQuery.isFetching} />';
  const expBad = "const categoryOptions = useMemo(() => costContextQuery.data?.expense_categories);";
  const expNoLoading =
    "const categoryOptions = useMemo(() => { const c = paymentAccountsQuery.data?.accounts ?? []; });\n" +
    '<ReferenceSelect createKind="category" placeholder="Select category…" />';
  if (assertBill(billGood).length !== 0) { console.error("SELFTEST FAIL: bill good flagged", assertBill(billGood)); process.exit(1); }
  if (assertBill(billBad).length === 0) { console.error("SELFTEST FAIL: bill bad passed"); process.exit(1); }
  if (assertExpense(expGood).length !== 0) { console.error("SELFTEST FAIL: expense good flagged", assertExpense(expGood)); process.exit(1); }
  if (assertExpense(expBad).length === 0) { console.error("SELFTEST FAIL: expense bad passed"); process.exit(1); }
  if (assertExpense(expNoLoading).length === 0) {
    console.error("SELFTEST FAIL: expense missing loading passed");
    process.exit(1);
  }
  console.log("verify-bill-expense-category-full-coa selftest OK");
  process.exit(0);
}

for (const p of [BILL, EXPENSE]) if (!fs.existsSync(p)) { console.error(`GUARD FAIL: missing ${p}`); process.exit(1); }
const errors = [...assertBill(fs.readFileSync(BILL, "utf8")), ...assertExpense(fs.readFileSync(EXPENSE, "utf8"))];
if (errors.length) {
  console.error("GUARD FAIL — Bill/Expense Category selectors must source the FULL Chart-of-Accounts:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("verify-bill-expense-category-full-coa OK — Bill + Expense Category selectors source the full COA");
