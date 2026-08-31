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

  const feInv = read("apps/frontend/src/pages/accounting/InvoicesListPage.tsx");
  assert.match(feInv, /action: "void"|runInvoiceBulk\("void"/);
  assert.match(feInv, /VoidReasonModal/);

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
