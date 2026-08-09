#!/usr/bin/env node
/** LST-F118 — Bill detail / PayBill / BillPayment detail / CCPayment: no UUID-slice chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/pages/accounting/BillDetailPage.tsx",
  "apps/frontend/src/pages/accounting/PayBillModal.tsx",
  "apps/frontend/src/pages/accounting/BillPaymentDetailPage.tsx",
  "apps/frontend/src/pages/accounting/bill-payments/CCPaymentModal.tsx",
];
const LABEL = "verify-paybill-detail-human-labels";
const SELFTEST = process.argv.includes("--selftest");

function assertAll(srcs) {
  const problems = [];
  for (const [file, src] of Object.entries(srcs)) {
    if (/\.id\.slice\(0,\s*8\)/.test(src) || /bill_number\s*\|\|\s*bill\.id\.slice/.test(src) || /return id\.slice\(0,\s*8\)/.test(src)) {
      problems.push(`${file}: still contains UUID slice chrome`);
    }
    if (!/entityLabel\(/.test(src)) {
      problems.push(`${file}: missing entityLabel`);
    }
  }
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const planted = { ...srcs };
  const key = FILES[0];
  planted[key] = planted[key].replace(
    /entityLabel\(bill\.bill_number,\s*bill\.id,\s*"Bill"\)/,
    "bill.bill_number ?? bill.id.slice(0, 8)",
  );
  if (!assertAll(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  const live = assertAll(srcs);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
