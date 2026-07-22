#!/usr/bin/env node
/**
 * Rule-17 guard: bill detail reverse drill-through (Law §9).
 * Mirrors verify-expense-detail-route — lines + JE + vendor/unit/WO/load links.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bill-detail-reverse";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertBillDetailReverse() {
  const errors = [];
  const service = read("apps/backend/src/accounting/bills.service.ts");
  const detailPage = read("apps/frontend/src/pages/accounting/BillDetailPage.tsx");
  const api = read("apps/frontend/src/api/accounting.ts");
  const manifest = read("apps/frontend/src/routes/manifest.tsx");
  const entityLink = read("apps/frontend/src/components/shared/EntityLink.tsx");

  if (!/export async function getBillDetail\(/.test(service)) {
    errors.push("backend: getBillDetail must exist");
  }
  if (!/FROM accounting\.bill_lines/.test(service)) {
    errors.push("backend: getBillDetail must SELECT bill_lines");
  }
  if (!/source_transaction_type = 'bill'/.test(service) || !/journal_entry_uuid/.test(service)) {
    errors.push("backend: getBillDetail must resolve journal_entry via postings source_transaction_type='bill'");
  }
  if (!/path=["']\/accounting\/bills\/:id["']/.test(manifest)) {
    errors.push("manifest: must mount /accounting/bills/:id");
  }
  if (!/BillDetailPage/.test(manifest)) {
    errors.push("manifest: BillDetailPage must be wired");
  }
  if (!/export function BillDetailPage/.test(detailPage)) {
    errors.push("BillDetailPage: exported component missing");
  }
  if (!/data-testid="bill-detail-lines"/.test(detailPage)) {
    errors.push("BillDetailPage: must declare bill-detail-lines reverse marker");
  }
  for (const needle of ['kind="vendor"', 'kind="journal_entry"', "chart-of-accounts/register"]) {
    if (!detailPage.includes(needle)) {
      errors.push(`BillDetailPage: must render clickable link for ${needle}`);
    }
  }
  if (!/export type BillDetailLine/.test(api)) {
    errors.push("api/accounting.ts: BillDetailLine type missing");
  }
  if (!/lines: BillDetailLine\[\]/.test(api)) {
    errors.push("api/accounting.ts: getVendorBill must return lines");
  }
  if (!/`\/accounting\/bills\/\$\{id\}`/.test(entityLink)) {
    errors.push("EntityLink: bill must resolve to /accounting/bills/${id}");
  }
  return errors;
}

function selftest() {
  const errors = assertBillDetailReverse();
  if (errors.length) {
    console.error(`${LABEL} SELFTEST FAILED — live sources rejected: ${errors.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertBillDetailReverse();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
