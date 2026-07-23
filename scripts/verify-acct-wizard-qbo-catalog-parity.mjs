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
// Unit picker must NOT hard-filter status. "Active" was an invalid enum the backend silently
// swallowed, so the picker returned ALL non-deactivated units; pinning a real status turned it into
// a hard filter that hides InMaintenance / OutOfService / Damaged units — exactly the units a repair
// bill or a tow expense is written against. The earlier version of this guard ASSERTED the defect.
if (/listUnits\(\{[^}]*status:/.test(bill)) {
  fail("VendorBillForm unit picker must not hard-filter status — in-shop / OOS units must stay selectable for repair bills");
}
// A/P account list must come from listCatalogAccounts, whose row shape carries is_postable.
// getCoaAccounts' row shape omits it, which is what silently dropped the is_postable predicate and
// let non-postable Liability headers (e.g. Driver Escrow parents) into the "A/P Account" picker.
if (!bill.includes("listCatalogAccounts({ status:")) {
  fail("VendorBillForm A/P must use entity-scoped listCatalogAccounts (its rows carry is_postable)");
}
if (!bill.includes("acct.is_postable")) {
  fail("VendorBillForm A/P filter must keep the is_postable predicate — non-postable header accounts must never be selectable");
}
ok("VendorBillForm QBO/catalog wiring");

const expense = read("apps/frontend/src/components/expenses/RecordExpenseForm.tsx");
if (!expense.includes("operating_company_id: operatingCompanyId")) {
  fail("RecordExpenseForm listCatalogAccounts must pass operating_company_id");
}
if (/listUnits\(\{[^}]*status:/.test(expense)) {
  fail("RecordExpenseForm unit picker must not hard-filter status — a tow/roadside expense targets an OOS or in-shop unit");
}
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
