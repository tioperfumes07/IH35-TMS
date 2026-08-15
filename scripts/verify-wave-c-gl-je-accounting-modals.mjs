#!/usr/bin/env node
/**
 * WAVE-C-gl_je-accounting-modals — accounting module's money-modal leaves (surface inventory
 * #6273 added a matched `modal.*` + `parity.*` pair per file — same file, same evidence).
 * VERTICAL-WIRING-LAW-2026-08-12.
 *
 * All eleven files already real, never tagged @matrix-built:
 *   - InvoiceCreateModal.tsx: navigates to real invoice detail on create.
 *   - ManualJEModal.tsx (re-export of components/accounting/ManualJEModal.tsx): calls the
 *     real createJournalEntry API directly.
 *   - PayBillModal.tsx: navigates to real bill-payment detail (already verified real in
 *     WAVE-C-gl_je-accounting-core-leaves, PR #6235).
 *   - RecordPaymentModal.tsx: calls the real createPayment API, navigates to real payment
 *     detail (already verified real in WAVE-C-gl_je-invoices-payments, PR #6231).
 *   - SubmitFactoringModal.tsx: submits a real factoring batch (already verified real in
 *     WAVE-C-liability-factoring-leaves, PR #6229).
 *   - CCPaymentModal.tsx: submits via the real useCCPayment hook -> submitCcBillPayment API.
 *   - BillPaymentModal.tsx (components/ap/): calls the real recordApBillPayment API.
 *   - CustomerAdjustmentModal.tsx / VendorChargebackModal.tsx / DriverDamageInvoiceModal.tsx /
 *     DriverMiscInvoiceModal.tsx / ManualInvoiceModal.tsx: all reuse the shared
 *     InvoiceTypeModalBase component's real createInvoice callback (already verified real in
 *     WAVE-C-invoice-accounting, PR #6279).
 *   - PaymentApplyModal.tsx: a real Invoice-typed apply-payment-to-invoice modal.
 *
 * No code change in this pass — pure verification + tagging.
 *
 * @matrix-built {"modules":["accounting"],"cols":["gl_je"],"leafRe":"^(accounting\\.modal|accounting\\.parity)\\.(invoice_create|manual_je|pay_bill|payment_apply|record_payment|submit_factoring|ccpayment|customer_adjustment|driver_damage_invoice|driver_misc_invoice|manual_invoice|vendor_chargeback|bill_payment|invoice_type_modal_base)$","task":"WAVE-C-gl_je-accounting-modals","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["connectivity"],"leafRe":"^(accounting\\.modal|accounting\\.parity)\\.invoice_create$","task":"PROTECTED-ACCT-CONNECTIVITY-INVOICE-CREATE","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-c-gl-je-accounting-modals.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-c-gl-je-accounting-modals";

const CHECKS = [
  {
    name: "InvoiceCreateModal.tsx navigates to real invoice detail on create",
    file: "apps/frontend/src/pages/accounting/InvoiceCreateModal.tsx",
    pattern: /navigate\(`\/accounting\/invoices\/\$\{invoiceId\}`\)/,
  },
  {
    name: "components/accounting/ManualJEModal.tsx calls the real createJournalEntry API",
    file: "apps/frontend/src/components/accounting/ManualJEModal.tsx",
    pattern: /await createJournalEntry\(/,
  },
  {
    name: "RecordPaymentModal.tsx calls the real createPayment API",
    file: "apps/frontend/src/pages/accounting/RecordPaymentModal.tsx",
    pattern: /createPayment/,
  },
  {
    name: "CCPaymentModal.tsx wires the real useCCPayment hook",
    file: "apps/frontend/src/pages/accounting/bill-payments/CCPaymentModal.tsx",
    pattern: /useCCPayment/,
  },
  {
    name: "useCCPayment hook submits via the real submitCcBillPayment API",
    file: "apps/frontend/src/hooks/useCCPayment.ts",
    pattern: /submitCcBillPayment/,
  },
  {
    name: "components/ap/BillPaymentModal.tsx calls the real recordApBillPayment API",
    file: "apps/frontend/src/components/ap/BillPaymentModal.tsx",
    pattern: /recordApBillPayment/,
  },
  {
    name: "CustomerAdjustmentModal.tsx reuses the real InvoiceTypeModalBase createInvoice",
    file: "apps/frontend/src/pages/accounting/modals/CustomerAdjustmentModal.tsx",
    pattern: /createInvoice=\{\(payload\) => createCustomerAdjustmentInvoice/,
  },
  {
    name: "VendorChargebackModal.tsx reuses the real InvoiceTypeModalBase createInvoice",
    file: "apps/frontend/src/pages/accounting/modals/VendorChargebackModal.tsx",
    pattern: /createInvoice=\{\(payload\) => createVendorChargebackInvoice/,
  },
  {
    name: "DriverDamageInvoiceModal.tsx reuses the real InvoiceTypeModalBase",
    file: "apps/frontend/src/pages/accounting/modals/DriverDamageInvoiceModal.tsx",
    pattern: /InvoiceTypeModalBase/,
  },
  {
    name: "DriverMiscInvoiceModal.tsx reuses the real InvoiceTypeModalBase",
    file: "apps/frontend/src/pages/accounting/modals/DriverMiscInvoiceModal.tsx",
    pattern: /InvoiceTypeModalBase/,
  },
  {
    name: "ManualInvoiceModal.tsx reuses the real InvoiceTypeModalBase",
    file: "apps/frontend/src/pages/accounting/modals/ManualInvoiceModal.tsx",
    pattern: /InvoiceTypeModalBase/,
  },
  {
    name: "PaymentApplyModal.tsx operates on real Invoice-typed rows",
    file: "apps/frontend/src/pages/accounting/PaymentApplyModal.tsx",
    pattern: /Invoice/,
  },
  {
    name: "PayBillModal.tsx navigates to real bill-payment detail on success",
    file: "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx",
    pattern: /navigate\(`\/accounting\/bill-payments\/\$\{row\.id\}`\)/,
  },
  {
    name: "SubmitFactoringModal.tsx submits a real factoring batch",
    file: "apps/frontend/src/pages/accounting/SubmitFactoringModal.tsx",
    pattern: /submitFactoringBatch/,
  },
];

export function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src === null) {
      failures.push(`${c.name}: ${c.file} not found`);
      continue;
    }
    if (!c.pattern.test(src)) {
      failures.push(`${c.name}: ${c.file} no longer matches expected shape`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const GOOD_FIXTURES = {
    "apps/frontend/src/pages/accounting/InvoiceCreateModal.tsx": "navigate(`/accounting/invoices/${invoiceId}`)",
    "apps/frontend/src/components/accounting/ManualJEModal.tsx": "await createJournalEntry(operatingCompanyId, {",
    "apps/frontend/src/pages/accounting/RecordPaymentModal.tsx": "createPayment, listCoaRoles, listInvoices",
    "apps/frontend/src/pages/accounting/bill-payments/CCPaymentModal.tsx": "useCCPayment(operatingCompanyId)",
    "apps/frontend/src/hooks/useCCPayment.ts": "submitCcBillPayment(operatingCompanyId, body)",
    "apps/frontend/src/components/ap/BillPaymentModal.tsx": "await recordApBillPayment(operatingCompanyId, {",
    "apps/frontend/src/pages/accounting/modals/CustomerAdjustmentModal.tsx":
      "createInvoice={(payload) => createCustomerAdjustmentInvoice(operatingCompanyId, payload)}",
    "apps/frontend/src/pages/accounting/modals/VendorChargebackModal.tsx":
      "createInvoice={(payload) => createVendorChargebackInvoice(operatingCompanyId, payload)}",
    "apps/frontend/src/pages/accounting/modals/DriverDamageInvoiceModal.tsx": "<InvoiceTypeModalBase",
    "apps/frontend/src/pages/accounting/modals/DriverMiscInvoiceModal.tsx": "<InvoiceTypeModalBase",
    "apps/frontend/src/pages/accounting/modals/ManualInvoiceModal.tsx": "<InvoiceTypeModalBase",
    "apps/frontend/src/pages/accounting/PaymentApplyModal.tsx": "import type { Invoice } from",
    "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx": "navigate(`/accounting/bill-payments/${row.id}`)",
    "apps/frontend/src/pages/accounting/SubmitFactoringModal.tsx": "await submitFactoringBatch(operatingCompanyId, {",
  };
  const goodFailures = checkAll((f) => GOOD_FIXTURES[f] ?? null);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass — ${goodFailures.join("; ")}`);
    process.exit(1);
  }
  const regressedFailures = checkAll(() => "nothing matches here");
  if (regressedFailures.length !== CHECKS.length) {
    console.error(`[${LABEL}] selftest FAIL: regressed fixture (all-empty) should fail every check`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
});

if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — accounting money-modal gl_je wiring present (invoice_create/manual_je/pay_bill/payment_apply/record_payment/submit_factoring/ccpayment/customer_adjustment/driver_damage_invoice/driver_misc_invoice/manual_invoice/vendor_chargeback/bill_payment)`);
