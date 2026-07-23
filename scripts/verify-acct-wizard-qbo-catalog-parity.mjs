#!/usr/bin/env node
/**
 * Guard: Vendor Bill / Expense wizard QBO + catalog wiring (Accounting PR wave).
 * Proves: due-date helper, Terms not SelectCombobox box-in-box, entity-scoped CoA,
 * CostBreakdown ReferenceSelect when company set,
 * expense category allows TMS-native accounts (category_account_id).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};
const ok = (msg) => console.log(`OK: ${msg}`);

function read(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) fail(`missing ${rel}`);
  return fs.readFileSync(p, "utf8");
}

const due = read("apps/frontend/src/components/accounting/vendorBillDueDate.ts");
if (!due.includes("dueDateFromBillTerms") || !due.includes("netDaysFromTerms")) {
  fail("vendorBillDueDate helper missing exports");
}
ok("due-date helper present");

const bill = read("apps/frontend/src/components/accounting/VendorBillForm.tsx");
if (!bill.includes("dueDateFromBillTerms")) fail("VendorBillForm must auto-calc due date");
if (!bill.includes("dueDateTouched")) fail("VendorBillForm must respect manual due override");
if (bill.includes("SelectCombobox") && bill.includes("Terms")) {
  // Terms must be native <select>, not SelectCombobox (box-in-box)
  const termsBlock = bill.slice(bill.indexOf("Terms"), bill.indexOf("Due Date"));
  if (termsBlock.includes("SelectCombobox")) fail("Terms still uses SelectCombobox (box-in-box)");
}
if (!bill.includes('status: "InService"')) fail("VendorBillForm units must request InService");
if (!bill.includes("getCoaAccounts")) fail("VendorBillForm A/P must use entity-scoped getCoaAccounts");
ok("VendorBillForm QBO/catalog wiring");

const expense = read("apps/frontend/src/components/expenses/RecordExpenseForm.tsx");
if (!expense.includes("operating_company_id: operatingCompanyId")) {
  fail("RecordExpenseForm listCatalogAccounts must pass operating_company_id");
}
if (!expense.includes('status: "InService"')) fail("RecordExpenseForm units must request InService");
if (expense.includes("acct.qbo_account_id)") && expense.includes("filter((acct) => acct.is_postable && acct.qbo_account_id)")) {
  fail("RecordExpenseForm must NOT filter categories to qbo_account_id-only");
}
ok("RecordExpenseForm entity CoA + drivers");

const submit = read("apps/frontend/src/components/expenses/recordExpenseSubmit.ts");
if (!submit.includes("category_account_id")) fail("submitRecordExpense must send category_account_id");
ok("expense submit supports TMS-native category");

const routes = read("apps/backend/src/accounting/expenses.routes.ts");
if (!routes.includes("category_account_id")) fail("expenses.routes must accept category_account_id");
ok("expenses.routes category_account_id");

const cost = read("apps/frontend/src/components/forms/shared/CostBreakdownBox.tsx");
if (!cost.includes("ReferenceSelect") || !cost.includes("operatingCompanyId")) {
  fail("CostBreakdownBox must use ReferenceSelect when operatingCompanyId set");
}
if (!cost.includes('addNewLabel="+ Add new category"') && !cost.includes("Add new category")) {
  fail("CostBreakdownBox must place + Add new category inside ReferenceSelect");
}
ok("CostBreakdownBox inline + Add new category");

const catalogApi = read("apps/frontend/src/api/catalog-accounts.ts");
if (!catalogApi.includes("operating_company_id")) {
  fail("listCatalogAccounts must accept operating_company_id");
}
ok("listCatalogAccounts entity scope");

console.log("PASS: verify-acct-wizard-qbo-catalog-parity");
