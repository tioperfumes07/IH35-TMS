#!/usr/bin/env node
/**
 * Rule-17: bill payment reverse drill-through (Law §9).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bill-payment-detail-reverse";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertBillPaymentDetailReverse() {
  const errors = [];
  const service = read("apps/backend/src/accounting/bills.service.ts");
  const routes = read("apps/backend/src/accounting/bills.routes.ts");
  const detailPage = read("apps/frontend/src/pages/accounting/BillPaymentDetailPage.tsx");
  const listPage = read("apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx");
  const register = read("apps/frontend/src/pages/accounting/AccountRegisterPage.tsx");
  const entityLink = read("apps/frontend/src/components/shared/EntityLink.tsx");
  const api = read("apps/frontend/src/api/accounting.ts");
  const manifest = read("apps/frontend/src/routes/manifest.tsx");

  if (!/export async function getBillPaymentDetail\(/.test(service)) {
    errors.push("backend: getBillPaymentDetail missing");
  }
  if (!/source_transaction_type = 'bill_payment'/.test(service)) {
    errors.push("backend: must resolve JE via source_transaction_type='bill_payment'");
  }
  if (!/app\.get\(\s*["']\/api\/v1\/accounting\/bill-payments\/:id["']/.test(routes)) {
    errors.push("backend: GET /api/v1/accounting/bill-payments/:id missing");
  }
  if (!/path=["']\/accounting\/bill-payments\/:id["']/.test(manifest)) {
    errors.push("manifest: /accounting/bill-payments/:id missing");
  }
  if (!/BillPaymentDetailPage/.test(manifest)) {
    errors.push("manifest: BillPaymentDetailPage must be wired");
  }
  if (!/export function BillPaymentDetailPage/.test(detailPage)) {
    errors.push("BillPaymentDetailPage missing");
  }
  if (!/data-testid="bill-payment-detail"/.test(detailPage)) {
    errors.push("BillPaymentDetailPage: reverse marker missing");
  }
  if (!/kind="journal_entry"/.test(detailPage) || !/kind="bill"/.test(detailPage)) {
    errors.push("BillPaymentDetailPage: must EntityLink bill + journal_entry");
  }
  if (/entityLabel\(\s*null\s*,\s*payment\.journal_entry_id/.test(detailPage)) {
    errors.push("BillPaymentDetailPage: JE label must not tombstone when date is missing — use memo via humanMemo");
  }
  if (!/humanMemo\(payment\.journal_entry_memo/.test(detailPage)) {
    errors.push("BillPaymentDetailPage: must run journal_entry_memo through humanMemo (strip poster UUIDs)");
  }
  if (!/COALESCE\(NULLIF\(btrim\(je\.memo\), ''\), 'Bill payment'\)/.test(service)) {
    errors.push("getBillPaymentDetail: empty JE memo must fall back to Bill payment, not a UUID tombstone");
  }
  if (!/\/accounting\/bill-payments\/\$\{reference\}/.test(register)) {
    errors.push("AccountRegisterPage: bill_payment sourceRoute must include reference id");
  }
  if (!/"bill_payment"/.test(entityLink) || !/`\/accounting\/bill-payments\/\$\{id\}`/.test(entityLink)) {
    errors.push("EntityLink: bill_payment kind → /accounting/bill-payments/${id}");
  }
  if (!/export function getBillPayment\(/.test(api)) {
    errors.push("api: getBillPayment missing");
  }
  if (!/humanMemo\(row\.journal_entry_memo/.test(listPage)) {
    errors.push("BillPaymentsListPage: must run journal_entry_memo through humanMemo");
  }
  if (!/onRowClick=\{.*bill-payments/.test(listPage.replace(/\n/g, " "))) {
    errors.push("BillPaymentsListPage: onRowClick must navigate to detail");
  }
  return errors;
}

function selftest() {
  const errors = assertBillPaymentDetailReverse();
  if (errors.length) {
    console.error(`${LABEL} SELFTEST FAILED: ${errors.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertBillPaymentDetailReverse();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
