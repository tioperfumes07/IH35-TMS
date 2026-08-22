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

function billPaymentDetailReverseErrors(sources = {}) {
  const errors = [];
  const service = sources.service ?? read("apps/backend/src/accounting/bills.service.ts");
  const routes = sources.routes ?? read("apps/backend/src/accounting/bills.routes.ts");
  const detailPage = sources.detailPage ?? read("apps/frontend/src/pages/accounting/BillPaymentDetailPage.tsx");
  const listPage = sources.listPage ?? read("apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx");
  const billDetailPage = sources.billDetailPage ?? read("apps/frontend/src/pages/accounting/BillDetailPage.tsx");
  const billsPage = sources.billsPage ?? read("apps/frontend/src/pages/accounting/BillsPage.tsx");
  const register = sources.register ?? read("apps/frontend/src/pages/accounting/AccountRegisterPage.tsx");
  const entityLink = sources.entityLink ?? read("apps/frontend/src/components/shared/EntityLink.tsx");
  const api = sources.api ?? read("apps/frontend/src/api/accounting.ts");
  const manifest = sources.manifest ?? read("apps/frontend/src/routes/manifest.tsx");

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
  for (const [surface, source] of [
    ["BillDetailPage Payments table", billDetailPage],
    ["BillsPage expanded payments table", billsPage],
  ]) {
    if (!/kind=["']bill_payment["']/.test(source)) {
      errors.push(`${surface}: payment rows must reverse-drill to canonical bill-payment detail`);
    }
    if (!/entityLabel\([^)]*(?:reference_number|check_number)[^)]*\.id[^)]*["']Payment["']/.test(source.replace(/\n/g, " "))) {
      errors.push(`${surface}: payment drill must show a human reference/check label with honest fallback`);
    }
  }
  return errors;
}

function selftest() {
  const baseline = billPaymentDetailReverseErrors();
  if (baseline.length) throw new Error(`baseline failed: ${baseline.join("; ")}`);
  for (const [name, mutation] of [
    ["bill detail payment drill", { billDetailPage: read("apps/frontend/src/pages/accounting/BillDetailPage.tsx").replace('kind="bill_payment"', 'kind="bill"') }],
    ["bills list payment drill", { billsPage: read("apps/frontend/src/pages/accounting/BillsPage.tsx").replace('kind="bill_payment"', 'kind="bill"') }],
  ]) {
    if (billPaymentDetailReverseErrors(mutation).length === 0) {
      throw new Error(`inert planted defect: ${name}`);
    }
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

try {
  const errors = billPaymentDetailReverseErrors();
  if (errors.length) throw new Error(errors.join("; "));
  if (process.argv.includes("--selftest")) selftest();
  console.log(`${LABEL} PASS`);
} catch (error) {
  console.error(`${LABEL} FAIL: ${error.message}`);
  process.exitCode = 1;
}
