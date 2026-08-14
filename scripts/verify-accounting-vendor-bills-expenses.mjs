#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["vendor"],"leafRe":"^bills\\.(list|create\\.(vendor|maintenance|fuel|driver)|multiple|recurring|detail)$","task":"LINK-F5166-ACCOUNTING-BILLS-VENDOR"} */
/** @matrix-built {"modules":["accounting"],"cols":["vendor"],"leafRe":"^expenses\\.(list|create|detail)$","task":"LINK-F5166-ACCOUNTING-EXPENSES-VENDOR"} */
/** @matrix-built {"modules":["accounting"],"cols":["vendor"],"leafRe":"^(bill_payments\\.(list|create)|ap\\.aging|vendors|accounting\\.(modal\\.vendor_chargeback|parity\\.(vendor_bill_create_page|vendor_credits_page)))$","task":"LINK-F5166-ACCOUNTING-AP-VENDOR"} */
/**
 * OWNER-EXECUTION-PLAN vertical vendor-column sweep (2026-08-14): all 18 genuine accounting vendor
 * leaves, each confirmed live — real vendor_id/EntityLink kind="vendor" or a real
 * ReferenceSelect(createKind="vendor"), sourced from mdata.vendors. All 4 bill-type creators
 * (vendor/maintenance/fuel/driver) share the same unconditional Vendor* picker in VendorBillForm.tsx
 * (routed through category query params, not separate forms).
 *
 * Self-test: node scripts/verify-accounting-vendor-bills-expenses.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  billsList: "apps/frontend/src/pages/accounting/BillsPage.tsx",
  vendorBillForm: "apps/frontend/src/components/accounting/VendorBillForm.tsx",
  multipleBills: "apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx",
  recurringList: "apps/frontend/src/pages/accounting/bills/RecurringBillList.tsx",
  recurringCreate: "apps/frontend/src/pages/accounting/bills/RecurringBillCreate.tsx",
  billDetail: "apps/frontend/src/pages/accounting/BillDetailPage.tsx",
  expensesList: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx",
  recordExpenseForm: "apps/frontend/src/components/expenses/RecordExpenseForm.tsx",
  expenseDetail: "apps/frontend/src/pages/accounting/ExpenseDetailPage.tsx",
  billPaymentsList: "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx",
  payBillModal: "apps/frontend/src/pages/accounting/PayBillModal.tsx",
  apAging: "apps/frontend/src/pages/reports/APAgingPage.tsx",
  routesManifest: "apps/frontend/src/routes/manifest.tsx",
  chargeback: "apps/frontend/src/pages/accounting/modals/VendorChargebackModal.tsx",
  vendorCredits: "apps/frontend/src/pages/accounting/VendorCreditsPage.tsx",
};
const LABEL = "verify-accounting-vendor-bills-expenses";

export function audit(src) {
  const failures = [];
  if (!/billVendorDrillId/.test(src.billsList) || !/kind="vendor" id=\{billVendorDrillId\(bill\)\}/.test(src.billsList)) {
    failures.push(`${FILES.billsList}: bills list must render a real vendor EntityLink`);
  }
  if (!/Field label="Vendor \*"/.test(src.vendorBillForm) || !/createKind="vendor"/.test(src.vendorBillForm)) {
    failures.push(`${FILES.vendorBillForm}: bill create (all 4 category routes) must require a real vendor`);
  }
  if (!/createKind="vendor"/.test(src.multipleBills)) {
    failures.push(`${FILES.multipleBills}: bulk bill create rows must have a real vendor picker`);
  }
  if (!/kind="vendor" id=\{tmpl\.vendor_uuid\}/.test(src.recurringList)) {
    failures.push(`${FILES.recurringList}: recurring bill list must render a real vendor EntityLink`);
  }
  if (!/createKind="vendor"/.test(src.recurringCreate)) {
    failures.push(`${FILES.recurringCreate}: recurring bill create must have a real vendor picker`);
  }
  if (!/kind="vendor" id=\{billVendorDrillId\(bill\)\}/.test(src.billDetail)) {
    failures.push(`${FILES.billDetail}: bill detail must render a real vendor EntityLink`);
  }
  if (!/kind="vendor" id=\{r\.vendor_uuid\}/.test(src.expensesList)) {
    failures.push(`${FILES.expensesList}: expenses list must render a real vendor EntityLink`);
  }
  if (!/createKind="vendor"/.test(src.recordExpenseForm) || !/vendorUuid/.test(src.recordExpenseForm)) {
    failures.push(`${FILES.recordExpenseForm}: expense create must have a real vendor picker`);
  }
  if (!/kind="vendor"[\s\S]{0,20}id=\{expense\.vendor_uuid\}/.test(src.expenseDetail)) {
    failures.push(`${FILES.expenseDetail}: expense detail must render a real vendor EntityLink`);
  }
  if (!/kind="vendor" id=\{row\.mdata_vendor_id\}/.test(src.billPaymentsList)) {
    failures.push(`${FILES.billPaymentsList}: bill payments list must render a real vendor EntityLink`);
  }
  if (!/kind="vendor"/.test(src.payBillModal)) {
    failures.push(`${FILES.payBillModal}: pay-bill modal must render the real bill's vendor`);
  }
  if (!/function isVendorUuid/.test(src.apAging) || !/kind="vendor" id=\{r\.vendor_id\}/.test(src.apAging)) {
    failures.push(`${FILES.apAging}: AP aging must render real vendor EntityLinks with a real UUID guard`);
  }
  if (!/path="\/accounting\/vendors"/.test(src.routesManifest)) {
    failures.push(`${FILES.routesManifest}: /accounting/vendors must route to the real canonical vendor master`);
  }
  if (!/billToEntityType="vendor"/.test(src.chargeback)) {
    failures.push(`${FILES.chargeback}: vendor chargeback modal must delegate to the real vendor bill-to picker`);
  }
  if (!/kind="vendor" id=\{row\.vendor_id\}/.test(src.vendorCredits) || !/createKind="vendor"/.test(src.vendorCredits)) {
    failures.push(`${FILES.vendorCredits}: vendor credits page must render real vendor EntityLinks and a real vendor picker`);
  }
  return failures;
}

function loadSrc(root) {
  return Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(path.join(root, f), "utf8")]));
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["bills-list-link", "billsList", /kind="vendor" id=\{billVendorDrillId\(bill\)\}/, 'kind="unit" id={bill.unit_id}'],
    ["bill-form-field", "vendorBillForm", /Field label="Vendor \*"/, 'Field label="Category"'],
    ["multi-bills-picker", "multipleBills", /createKind="vendor"/g, 'createKind="unit"'],
    ["recurring-list-link", "recurringList", /kind="vendor" id=\{tmpl\.vendor_uuid\}/, 'kind="unit" id={tmpl.unit_id}'],
    ["recurring-create-picker", "recurringCreate", /createKind="vendor"/g, 'createKind="unit"'],
    ["bill-detail-link", "billDetail", /kind="vendor" id=\{billVendorDrillId\(bill\)\}/, 'kind="unit" id={bill.unit_id}'],
    ["expenses-list-link", "expensesList", /kind="vendor" id=\{r\.vendor_uuid\}/, 'kind="unit" id={r.unit_id}'],
    ["expense-form-picker", "recordExpenseForm", /createKind="vendor"/g, 'createKind="unit"'],
    ["expense-detail-link", "expenseDetail", /kind="vendor"[\s\S]{0,20}id=\{expense\.vendor_uuid\}/, 'kind="unit" id={expense.unit_id}'],
    ["bill-payments-link", "billPaymentsList", /kind="vendor" id=\{row\.mdata_vendor_id\}/, 'kind="unit" id={row.unit_id}'],
    ["pay-bill-modal-link", "payBillModal", /kind="vendor"/g, 'kind="unit"'],
    ["ap-aging-guard", "apAging", /function isVendorUuid/, "function isUnusedGuard"],
    ["vendors-route", "routesManifest", /path="\/accounting\/vendors"/, 'path="/accounting/vendors-unused"'],
    ["chargeback-delegate", "chargeback", /billToEntityType="vendor"/, 'billToEntityType="customer"'],
    ["vendor-credits-link", "vendorCredits", /kind="vendor" id=\{row\.vendor_id\}/, 'kind="unit" id={row.unit_id}'],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const mutated = { ...good, [key]: good[key].replace(pattern, replacement) };
    if (mutated[key] === good[key]) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — accounting's vendor-scoped bills/expenses/AP surfaces are real`);
