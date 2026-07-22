#!/usr/bin/env node
/**
 * PLUS-01 / CHROME-11 — money pickers must use ReferenceSelect (+ Create) and nested
 * create must not open a centered Modal shell.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

const failures = [];

const bill = read("apps/frontend/src/components/accounting/VendorBillForm.tsx");
if (bill.includes("QboCombobox")) {
  failures.push("VendorBillForm still uses QboCombobox for A/P — must be ReferenceSelect");
}
if (!bill.includes('createKind="class"')) {
  failures.push("VendorBillForm Class must use ReferenceSelect createKind=class");
}
if (!bill.includes('createKind="category"') && !bill.includes("A/P Account")) {
  failures.push("VendorBillForm A/P Account must use ReferenceSelect");
}
if (bill.includes('placeholder="Class"') && bill.includes("<input") && /Field label="Class"[\s\S]*?<input/.test(bill)) {
  failures.push("VendorBillForm Class still free-text input");
}

const payment = read("apps/frontend/src/pages/accounting/RecordPaymentModal.tsx");
if (!payment.includes("ReferenceSelect") || !payment.includes('createKind="customer"')) {
  failures.push("RecordPaymentModal Customer must use ReferenceSelect createKind=customer");
}
if (/\bCombobox\b/.test(payment) && !payment.includes("ReferenceSelect")) {
  failures.push("RecordPaymentModal still on bare Combobox");
}

const expense = read("apps/frontend/src/components/expenses/RecordExpenseForm.tsx");
if (!expense.includes("Payment account") || !/payment-account[\s\S]{0,400}ReferenceSelect/.test(expense)) {
  // softer: ensure ReferenceSelect appears after payment account label
  const idx = expense.indexOf("Payment account");
  const slice = expense.slice(idx, idx + 500);
  if (!slice.includes("ReferenceSelect")) {
    failures.push("RecordExpenseForm Payment account must use ReferenceSelect");
  }
}

const map = read("apps/frontend/src/pages/accounting/ExpenseCategoryMapPage.tsx");
if (map.includes("expense-category-account-options") || map.includes("<datalist")) {
  failures.push("ExpenseCategoryMapPage must not use UUID datalist — use ReferenceSelect");
}
if (!map.includes("ReferenceSelect")) {
  failures.push("ExpenseCategoryMapPage missing ReferenceSelect");
}

const ref = read("apps/frontend/src/components/parity/ReferenceSelect.tsx");
if (!ref.includes("InlineCreateDrawer") || !ref.includes('"vendor"') || !ref.includes('"customer"')) {
  failures.push("ReferenceSelect must route vendor/customer through InlineCreateDrawer");
}

const quick = read("apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx");
if (quick.includes("<Modal ") || quick.includes("from \"../../../components/Modal\"")) {
  failures.push("QuickCreateEntityModal must use ParityDrawer (not centered Modal)");
}
if (!quick.includes("ParityDrawer")) {
  failures.push("QuickCreateEntityModal missing ParityDrawer");
}

const ccPayment = read("apps/frontend/src/pages/banking/RecordCCPaymentModal.tsx");
if (ccPayment.includes("QboCombobox")) {
  failures.push("RecordCCPaymentModal must not use QboCombobox");
}
if (!ccPayment.includes("ReferenceSelect") || !ccPayment.includes('createKind="vendor"')) {
  failures.push("RecordCCPaymentModal Credit card vendor must use ReferenceSelect createKind=vendor");
}

const manualJe = read("apps/frontend/src/components/accounting/ManualJEModal.tsx");
if (!manualJe.includes('createKind="class"')) {
  failures.push("ManualJEModal Class must use ReferenceSelect createKind=class");
}
if (!manualJe.includes('createKind="account"')) {
  failures.push("ManualJEModal Account must use ReferenceSelect createKind=account");
}
if (manualJe.includes("+ Add new account") && manualJe.includes("underline")) {
  failures.push("ManualJEModal must not keep separate + Add new account underline button");
}

const itemEditor = read("apps/frontend/src/pages/lists/accounting/ItemEditorModal.tsx");
if (!itemEditor.includes("Preferred vendor") || !/Preferred vendor[\s\S]{0,400}ReferenceSelect[\s\S]{0,200}createKind="vendor"/.test(itemEditor)) {
  failures.push("ItemEditorModal preferred vendor must use ReferenceSelect createKind=vendor");
}

const createWo = read("apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx");
if (createWo.includes("QboCombobox")) {
  failures.push("CreateWorkOrderModal must not use QboCombobox for outside vendor");
}
if (!createWo.includes("wo-outside-vendor-block") || !/wo-outside-vendor-block[\s\S]{0,800}ReferenceSelect[\s\S]{0,800}createKind="vendor"/.test(createWo)) {
  failures.push("CreateWorkOrderModal outside vendor must use ReferenceSelect createKind=vendor");
}

const cashGl = read("apps/frontend/src/pages/banking/CashGlSetupPage.tsx");
if (cashGl.includes("SelectCombobox") && !cashGl.includes("ReferenceSelect")) {
  failures.push("CashGlSetupPage Cash GL account must use ReferenceSelect");
}
if (!cashGl.includes("ReferenceSelect")) {
  failures.push("CashGlSetupPage missing ReferenceSelect for Cash GL account");
}

const transferModal = read("apps/frontend/src/pages/banking/TransferModal.tsx");
if (transferModal.includes("<Modal ") || transferModal.includes('from "../../components/Modal"')) {
  failures.push("TransferModal must use ParityDrawer (not centered Modal)");
}
if (!transferModal.includes("ParityDrawer")) {
  failures.push("TransferModal missing ParityDrawer");
}

if (!manualJe.includes("ParityDrawer")) {
  failures.push("ManualJEModal must use ParityDrawer (CHROME-12)");
}
if (manualJe.includes("<Modal ") || /from ["']\.\.\/Modal["']/.test(manualJe)) {
  failures.push("ManualJEModal must not import centered Modal");
}

const ccBill = read("apps/frontend/src/pages/accounting/bill-payments/CCPaymentModal.tsx");
if (!ccBill.includes("ParityDrawer") || /<Modal[\s/>]/.test(ccBill)) {
  failures.push("CCPaymentModal must use ParityDrawer (not Modal)");
}

const invoiceCreate = read("apps/frontend/src/pages/accounting/InvoiceCreateModal.tsx");
if (!invoiceCreate.includes("ParityDrawer") || /<Modal[\s/>]/.test(invoiceCreate)) {
  failures.push("InvoiceCreateModal must use ParityDrawer (not Modal)");
}


const fineCreate = read("apps/frontend/src/pages/safety/components/FineCreateModal.tsx");
if (fineCreate.includes('placeholder="UUID"') || /Driver ID[\s\S]{0,200}<input/.test(fineCreate)) {
  failures.push("FineCreateModal must not use raw UUID driver input — use driver Combobox");
}
if (!fineCreate.includes("listDrivers") || !fineCreate.includes("CreateDriverModal")) {
  failures.push("FineCreateModal must listDrivers + CreateDriverModal nested create");
}
if (!fineCreate.includes("ParityDrawer")) {
  failures.push("FineCreateModal must use ParityDrawer");
}

const cashAdv = read("apps/frontend/src/pages/driver-finance/CashAdvanceRequestsPage.tsx");
if (!cashAdv.includes("CreateDriverModal")) {
  failures.push("CashAdvanceRequestsPage must mount CreateDriverModal for nested driver create");
}
if (!cashAdv.includes("Create driver") && !cashAdv.includes("+ Create driver")) {
  failures.push("CashAdvanceRequestsPage driver Combobox must expose Create driver affordance");
}

const woId = read("apps/frontend/src/pages/maintenance/components/CreateWOSectionIdentification.tsx");
if (woId.includes("QboCombobox")) {
  failures.push("CreateWOSectionIdentification must not use QboCombobox");
}
if (!woId.includes('createKind="vendor"') || !woId.includes('createKind="customer"')) {
  failures.push("CreateWOSectionIdentification vendor+customer must use ReferenceSelect");
}

// ── overnight burn-down (2026-07-22): CoaRolesPage / InvoiceTypeModalBase / PaymentApplyModal ──
const coaRoles = read("apps/frontend/src/pages/accounting/CoaRolesPage.tsx");
if (coaRoles.includes("<datalist")) {
  failures.push("CoaRolesPage must not use raw UUID datalist — use ReferenceSelect");
}
if (!coaRoles.includes("ReferenceSelect") || !coaRoles.includes('createKind="category"')) {
  failures.push("CoaRolesPage account picker must use ReferenceSelect createKind=category");
}

const invoiceTypeModal = read("apps/frontend/src/pages/accounting/modals/InvoiceTypeModalBase.tsx");
if (invoiceTypeModal.includes("QboCombobox")) {
  failures.push("InvoiceTypeModalBase must not use QboCombobox — customer must be canonical mdata.customers");
}
if (!invoiceTypeModal.includes("ReferenceSelect") || !invoiceTypeModal.includes('createKind="customer"')) {
  failures.push("InvoiceTypeModalBase customer picker must use ReferenceSelect createKind=customer");
}
if (invoiceTypeModal.includes("<Modal ") || /from ["']\.\.\/\.\.\/\.\.\/components\/Modal["']/.test(invoiceTypeModal)) {
  failures.push("InvoiceTypeModalBase must use ParityDrawer (not centered Modal) — shared by 5 invoice-create flows");
}
if (!invoiceTypeModal.includes("ParityDrawer")) {
  failures.push("InvoiceTypeModalBase missing ParityDrawer");
}

const paymentApply = read("apps/frontend/src/pages/accounting/PaymentApplyModal.tsx");
if (paymentApply.includes("<Modal ") || /from ["']\.\.\/\.\.\/components\/Modal["']/.test(paymentApply)) {
  failures.push("PaymentApplyModal must use ParityDrawer (not centered Modal)");
}
if (!paymentApply.includes("ParityDrawer")) {
  failures.push("PaymentApplyModal missing ParityDrawer");
}

// ── overnight burn-down (2026-07-22): PLUS-02 remainder — Banking CoA pickers ──
// Bank account pickers (institution/account_mask) stay SelectCombobox per PLUS-02 law —
// only chart-of-accounts / class pickers must migrate to ReferenceSelect.
const bankTxCategorize = read("apps/frontend/src/pages/banking/BankTxCategorizationPage.tsx");
if (!bankTxCategorize.includes("ReferenceSelect") || !bankTxCategorize.includes('createKind="account"')) {
  failures.push("BankTxCategorizationPage CoA pickers (batch + per-row categorize) must use ReferenceSelect createKind=account");
}

const bankReconPage = read("apps/frontend/src/pages/banking/BankReconciliationPage.tsx");
if (!/varianceAccountId[\s\S]{0,200}ReferenceSelect|ReferenceSelect[\s\S]{0,200}varianceAccountId/.test(bankReconPage)) {
  failures.push("BankReconciliationPage variance account must use ReferenceSelect createKind=account");
}
if (!bankReconPage.includes("SelectCombobox")) {
  failures.push("BankReconciliationPage must still keep bank account picker on SelectCombobox (not CoA)");
}

const bankManualJe = read("apps/frontend/src/pages/banking/components/ManualJEModal.tsx");
if (bankManualJe.includes("<Modal ") || /from ["']\.\.\/\.\.\/\.\.\/components\/Modal["']/.test(bankManualJe)) {
  failures.push("banking/components/ManualJEModal must use ParityDrawer (not centered Modal)");
}
if (!bankManualJe.includes("ParityDrawer") || !bankManualJe.includes('createKind="account"') || !bankManualJe.includes('createKind="class"')) {
  failures.push("banking/components/ManualJEModal must use ParityDrawer + ReferenceSelect createKind=account/class");
}

if (failures.length) {
  console.error("FAIL verify-money-reference-select-plus:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("PASS verify-money-reference-select-plus");
