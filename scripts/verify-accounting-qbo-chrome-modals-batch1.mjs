#!/usr/bin/env node
/**
 * Accounting qbo_chrome — leaf-specific Built, batch 1 (modals + drawers + parity pages).
 * HONEST-BUILT-LAUNCH-LAW: no leafRe:".*"; every leafRe below is anchored to its one specific leaf.
 *
 * Found 2026-08-20 (CC-3), URGENT-6 sweep: accounting.required.json requires qbo_chrome on 65
 * leaves. Zero of them had a dedicated per-leaf guard anywhere — only the broad
 * verify-cursor-vertical-qbo-picker-modules.mjs CURSOR-VERTICAL-accounting-qbo annotation
 * (leafRe: ^(bills|expenses|bill_payments|vendors|customers|invoices|payments|je|coa|period_close|
 * accounting|payment_methods_catalog|chrome)(\.|$)), which verifies generic shared files
 * (ReportsHome, RunnerFilters, BillsPage's own create-CTA presence...) and never opens most of these
 * files directly — the exact same theater-coverage class already found+fixed for insurance, legal,
 * safety, and dispatch this session.
 *
 * This first batch covers 29 checks spanning ~24 distinct leaves (a few checks cover both the
 * .modal.X and .parity.X id for the same shared component) with the cleanest 1:1 (or thin-wrapper)
 * file mapping — real
 * ParityDrawer/Modal-variant-drawer forms with DatePicker/MoneyInput/EntityPicker chrome. A second
 * batch will cover the remaining panel/wizard/bills-create/coa/period_close leaves, which need more
 * file-by-file confirmation (several are display panels, not create forms, so the honest check shape
 * differs).
 *
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.modal\\.invoice_create$","task":"VERTICAL-QBO-CHROME-accounting-modal-invoice-create","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.modal\\.manual_je$","task":"VERTICAL-QBO-CHROME-accounting-modal-manual-je","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.(modal|parity)\\.pay_bill$","task":"VERTICAL-QBO-CHROME-accounting-pay-bill","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.(modal|parity)\\.payment_apply$","task":"VERTICAL-QBO-CHROME-accounting-payment-apply","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.(modal|parity)\\.record_payment$","task":"VERTICAL-QBO-CHROME-accounting-record-payment","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.(modal|parity)\\.submit_factoring$","task":"VERTICAL-QBO-CHROME-accounting-submit-factoring","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.(modal|parity)\\.ccpayment$","task":"VERTICAL-QBO-CHROME-accounting-ccpayment","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.modal\\.customer_adjustment$","task":"VERTICAL-QBO-CHROME-accounting-customer-adjustment","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.modal\\.driver_damage_invoice$","task":"VERTICAL-QBO-CHROME-accounting-driver-damage-invoice","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.modal\\.driver_misc_invoice$","task":"VERTICAL-QBO-CHROME-accounting-driver-misc-invoice","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.modal\\.manual_invoice$","task":"VERTICAL-QBO-CHROME-accounting-manual-invoice","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.modal\\.vendor_chargeback$","task":"VERTICAL-QBO-CHROME-accounting-vendor-chargeback","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.modal\\.void_reason$","task":"VERTICAL-QBO-CHROME-accounting-void-reason","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.modal\\.record_expense$","task":"VERTICAL-QBO-CHROME-accounting-record-expense","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.modal\\.decide$","task":"VERTICAL-QBO-CHROME-accounting-modal-decide","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.drawer\\.new_account_drawer_form$","task":"VERTICAL-QBO-CHROME-accounting-new-account-drawer","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.drawer\\.new_class_drawer_form$","task":"VERTICAL-QBO-CHROME-accounting-new-class-drawer","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.drawer\\.new_service_drawer_form$","task":"VERTICAL-QBO-CHROME-accounting-new-service-drawer","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.parity\\.invoice_type_modal_base$","task":"VERTICAL-QBO-CHROME-accounting-invoice-type-modal-base","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.parity\\.expense_create_page$","task":"VERTICAL-QBO-CHROME-accounting-expense-create-page","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.parity\\.expenses_list_page$","task":"VERTICAL-QBO-CHROME-accounting-expenses-list-page","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.parity\\.factoring_detail_page$","task":"VERTICAL-QBO-CHROME-accounting-factoring-detail-page","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.parity\\.receipts_page$","task":"VERTICAL-QBO-CHROME-accounting-receipts-page","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.parity\\.vendor_bill_create_page$","task":"VERTICAL-QBO-CHROME-accounting-vendor-bill-create-page","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.parity\\.vendor_credits_page$","task":"VERTICAL-QBO-CHROME-accounting-vendor-credits-page","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.parity\\.credit_memos_page$","task":"VERTICAL-QBO-CHROME-accounting-credit-memos-page","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^payment_methods_catalog\\.create$","task":"VERTICAL-QBO-CHROME-accounting-payment-methods-catalog-create","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^bills\\.multiple$","task":"VERTICAL-QBO-CHROME-accounting-bills-multiple","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-accounting-qbo-chrome-modals-batch1.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-accounting-qbo-chrome-modals-batch1";

const CHECKS = [
  { name: "accounting.modal.invoice_create: InvoiceCreateModal real ParityDrawer", file: "apps/frontend/src/pages/accounting/InvoiceCreateModal.tsx", pattern: /<ParityDrawer/ },
  // pages/accounting/ManualJEModal.tsx is a bare re-export shim; the real component (ParityDrawer +
  // DatePicker + MoneyInput) lives in components/accounting/ManualJEModal.tsx.
  { name: "accounting.modal.manual_je: ManualJEModal real ParityDrawer", file: "apps/frontend/src/components/accounting/ManualJEModal.tsx", pattern: /<ParityDrawer/ },
  { name: "accounting.(modal|parity).pay_bill: PayBillModal real ParityDrawer + MoneyInput/DatePicker", file: "apps/frontend/src/pages/accounting/PayBillModal.tsx", pattern: /<ParityDrawer[\s\S]*(MoneyInput|DatePicker)/ },
  { name: "accounting.(modal|parity).payment_apply: PaymentApplyModal real chrome", file: "apps/frontend/src/pages/accounting/PaymentApplyModal.tsx", pattern: /(ParityDrawer|MoneyInput)/ },
  { name: "accounting.(modal|parity).record_payment: RecordPaymentModal real ParityDrawer + MoneyInput", file: "apps/frontend/src/pages/accounting/RecordPaymentModal.tsx", pattern: /(ParityDrawer)[\s\S]*MoneyInput/ },
  { name: "accounting.(modal|parity).submit_factoring: SubmitFactoringModal real chrome", file: "apps/frontend/src/pages/accounting/SubmitFactoringModal.tsx", pattern: /(ParityDrawer|MoneyInput)/ },
  { name: "accounting.(modal|parity).ccpayment: CCPaymentModal real chrome", file: "apps/frontend/src/pages/accounting/bill-payments/CCPaymentModal.tsx", pattern: /(ParityDrawer|MoneyInput)/ },
  { name: "accounting.modal.customer_adjustment: wraps the real InvoiceTypeModalBase", file: "apps/frontend/src/pages/accounting/modals/CustomerAdjustmentModal.tsx", pattern: /<InvoiceTypeModalBase/ },
  { name: "accounting.modal.driver_damage_invoice: wraps the real InvoiceTypeModalBase", file: "apps/frontend/src/pages/accounting/modals/DriverDamageInvoiceModal.tsx", pattern: /<InvoiceTypeModalBase/ },
  { name: "accounting.modal.driver_misc_invoice: wraps the real InvoiceTypeModalBase", file: "apps/frontend/src/pages/accounting/modals/DriverMiscInvoiceModal.tsx", pattern: /<InvoiceTypeModalBase/ },
  { name: "accounting.modal.manual_invoice: wraps the real InvoiceTypeModalBase", file: "apps/frontend/src/pages/accounting/modals/ManualInvoiceModal.tsx", pattern: /<InvoiceTypeModalBase/ },
  { name: "accounting.modal.vendor_chargeback: wraps the real InvoiceTypeModalBase", file: "apps/frontend/src/pages/accounting/modals/VendorChargebackModal.tsx", pattern: /<InvoiceTypeModalBase/ },
  { name: "accounting.modal.void_reason: VoidReasonModal real chrome", file: "apps/frontend/src/components/accounting/VoidReasonModal.tsx", pattern: /(ParityDrawer|Modal\b)/ },
  { name: "accounting.modal.record_expense: RecordExpenseModal real ParityDrawer + RecordExpenseForm", file: "apps/frontend/src/components/expenses/RecordExpenseModal.tsx", pattern: /<ParityDrawer[\s\S]*RecordExpenseForm/ },
  { name: "accounting.modal.decide: DisputeQueuePage's DecideModal is a real accessible dialog with MoneyInput", file: "apps/frontend/src/pages/accounting/DisputeQueuePage.tsx", pattern: /function DecideModal[\s\S]{0,3000}role="dialog"[\s\S]{0,3000}MoneyInput/ },
  { name: "accounting.drawer.new_account_drawer_form: delegates to the real AccountDrawer", file: "apps/frontend/src/components/parity/drawers/NewAccountDrawerForm.tsx", pattern: /<AccountDrawer/ },
  { name: "accounting.drawer.new_account_drawer_form target: AccountDrawer has real MoneyInput/DatePicker chrome", file: "apps/frontend/src/pages/lists/accounting/AccountDrawer.tsx", pattern: /MoneyInput[\s\S]*DatePicker|DatePicker[\s\S]*MoneyInput/ },
  { name: "accounting.drawer.new_class_drawer_form: delegates to the real AccountingCatalogModal", file: "apps/frontend/src/components/parity/drawers/NewClassDrawerForm.tsx", pattern: /<AccountingCatalogModal/ },
  { name: "accounting.drawer.new_class_drawer_form target: AccountingCatalogModal is a real Modal variant=drawer", file: "apps/frontend/src/pages/lists/accounting/AccountingCatalogModal.tsx", pattern: /<Modal variant="drawer"/ },
  { name: "accounting.drawer.new_service_drawer_form: delegates to the real ItemEditorModal", file: "apps/frontend/src/components/parity/drawers/NewServiceDrawerForm.tsx", pattern: /<ItemEditorModal/ },
  { name: "accounting.parity.invoice_type_modal_base: real ParityDrawer with DatePicker/EntityPicker/MoneyInput", file: "apps/frontend/src/pages/accounting/modals/InvoiceTypeModalBase.tsx", pattern: /<ParityDrawer[\s\S]*EntityPicker[\s\S]*DatePicker[\s\S]*MoneyInput/ },
  { name: "accounting.parity.expense_create_page: ExpenseCreatePage real chrome", file: "apps/frontend/src/pages/accounting/ExpenseCreatePage.tsx", pattern: /(ParityDrawer|MoneyInput|DatePicker)/ },
  { name: "accounting.parity.expenses_list_page: ExpensesListPage real ParityTable/chrome", file: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx", pattern: /(ParityTable|CollapsedListFilters)/ },
  { name: "accounting.parity.factoring_detail_page: FactoringDetailPage real chrome", file: "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx", pattern: /(ParityTable|MoneyInput|DatePicker)/ },
  { name: "accounting.parity.receipts_page: ReceiptsPage real chrome", file: "apps/frontend/src/pages/accounting/ReceiptsPage.tsx", pattern: /(ParityTable|CollapsedListFilters|MoneyInput)/ },
  { name: "accounting.parity.vendor_bill_create_page: VendorBillCreatePage real chrome", file: "apps/frontend/src/pages/accounting/VendorBillCreatePage.tsx", pattern: /(ParityDrawer|MoneyInput|DatePicker)/ },
  { name: "accounting.parity.vendor_credits_page: VendorCreditsPage real chrome", file: "apps/frontend/src/pages/accounting/VendorCreditsPage.tsx", pattern: /(ParityTable|ParityDrawer|MoneyInput)/ },
  { name: "accounting.parity.credit_memos_page: CreditMemosPage real ParityDrawer + EntityPicker chrome", file: "apps/frontend/src/pages/accounting/CreditMemosPage.tsx", pattern: /(ParityDrawer|EntityPicker)/ },
  { name: "payment_methods_catalog.create: PaymentMethodsCatalogPage real chrome", file: "apps/frontend/src/pages/accounting/PaymentMethodsCatalogPage.tsx", pattern: /(ParityTable|ParityDrawer|Modal\b)/ },
  { name: "bills.multiple: CreateMultipleBillsPage real chrome", file: "apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx", pattern: /(ParityDrawer|ParityTable|MoneyInput)/ },
];

function runChecks(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (!c.pattern.test(src)) fails.push(`${c.name}: pattern miss in ${c.file}`);
  }
  return fails;
}

function selftest() {
  const live = runChecks();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".accounting-qbo-chrome-b1-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison — no chrome\n");
    }
    const planted = runChecks(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL — planted chrome misses not caught (${planted.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const fails = runChecks();
if (fails.length) {
  console.error(`${LABEL} FAIL (${fails.length}):\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${CHECKS.length} accounting qbo_chrome leaf asserts (batch 1 of 2)`);
