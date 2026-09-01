#!/usr/bin/env node
/**
 * BULK VOID LAW — void via void.service / atomic writers; set_status status=void CLOSED.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function main() {
  const invBulk = read("apps/backend/src/accounting/invoices-bulk.routes.ts");
  assert.match(invBulk, /E_USE_BULK_VOID/);
  assert.match(invBulk, /voidInvoiceInBulk/);
  assert.match(invBulk, /BATCH_VOID_ACTION/);
  assert.match(invBulk, /atomicFailStopActions/);
  // Must not call postVoidReversal gated only inside set_status void anymore
  assert.doesNotMatch(invBulk, /if \(statusPayload\.status === "void"\) \{\s*\n\s*const flagOn/);

  const voidSvcSrc = read("apps/backend/src/accounting/bulk-void.service.ts");
  assert.match(voidSvcSrc, /postVoidReversal/);
  assert.match(voidSvcSrc, /entityType: "invoice"/);

  const factory = read("apps/backend/src/bulk/bulk-update.factory.ts");
  assert.match(factory, /BulkFailStopError/);
  assert.match(factory, /atomicFailStop/);

  const expBulk = read("apps/backend/src/accounting/expenses-bulk.routes.ts");
  assert.match(expBulk, /BATCH_VOID_ACTION/);
  assert.match(expBulk, /reversePostedSourceTransactionInClientTx/);
  assert.match(expBulk, /accounting\/expenses\/bulk-update/);

  const billsBulk = read("apps/backend/src/accounting/bills-bulk.routes.ts");
  assert.match(billsBulk, /E_USE_BULK_VOID/);
  assert.match(billsBulk, /BATCH_VOID_ACTION/);
  assert.match(billsBulk, /voidBillInClientTx/);

  const payBulk = read("apps/backend/src/accounting/payments-bulk.routes.ts");
  assert.match(payBulk, /BATCH_VOID_ACTION/);
  assert.match(payBulk, /voidCustomerPaymentInBulk/);
  assert.match(payBulk, /accounting\/payments\/bulk-update/);

  const bpBulk = read("apps/backend/src/accounting/bill-payments-bulk.routes.ts");
  assert.match(bpBulk, /BATCH_VOID_ACTION/);
  assert.match(bpBulk, /voidBillPaymentInBulk|voidBillPaymentInClientTx/);
  assert.match(bpBulk, /accounting\/bill-payments\/bulk-update/);

  const voidSvcSrc2 = read("apps/backend/src/accounting/bulk-void.service.ts");
  assert.match(voidSvcSrc2, /entityType: "customer_payment"/);
  assert.match(voidSvcSrc2, /voidBillPaymentInBulk/);

  const feInv = read("apps/frontend/src/pages/accounting/InvoicesListPage.tsx");
  assert.match(feInv, /action: "void"|runInvoiceBulk\("void"/);
  assert.match(feInv, /VoidReasonModal/);

  const fePay = read("apps/frontend/src/pages/accounting/PaymentsListPage.tsx");
  assert.match(fePay, /resource: "payments"/);
  assert.match(fePay, /action: "void"/);

  const feBp = read("apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx");
  assert.match(feBp, /resource: "bill-payments"/);
  assert.match(feBp, /action: "void"/);

  const bulkHook = read("apps/frontend/src/components/bulk/useEntityBulkAction.ts");
  assert.doesNotMatch(bulkHook, /failed:\s*args\.ids\.map\(\(id\)\s*=>\s*\(\{\s*id,\s*message\s*\}\)\)/);
  assert.match(bulkHook, /ApiError/);
  assert.match(bulkHook, /parseStructuredBulkBody/);
  assert.match(bulkHook, /id:\s*"batch"/);
  assert.match(bulkHook, /rowLabels/);

  const bulkDialog = read("apps/frontend/src/components/bulk/BulkProgressDialog.tsx");
  assert.match(bulkDialog, /label\?:/);
  assert.match(bulkDialog, /item\.label/);

  const feExp = read("apps/frontend/src/pages/accounting/ExpensesListPage.tsx");
  assert.match(feExp, /action:\s*"void"/);
  assert.match(feExp, /rowLabels/);

  assert.match(factory, /rateLimit/);

  if (process.argv.includes("--selftest")) {
    const target = path.join(ROOT, "apps/backend/src/accounting/invoices-bulk.routes.ts");
    const original = fs.readFileSync(target, "utf8");
    const planted = original.replace(/E_USE_BULK_VOID/g, "E_CLOSED_PATH_REMOVED");
    try {
      fs.writeFileSync(target, planted);
      let failed = false;
      try {
        assert.match(fs.readFileSync(target, "utf8"), /E_USE_BULK_VOID/);
      } catch {
        failed = true;
      }
      assert.equal(failed, true, "selftest must FAIL when E_USE_BULK_VOID removed");
    } finally {
      fs.writeFileSync(target, original);
    }
    console.log("verify-bulk-void-via-void-service --selftest PASS");
    return;
  }

  console.log("verify-bulk-void-via-void-service PASS");
}

main();
