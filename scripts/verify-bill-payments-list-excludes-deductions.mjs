#!/usr/bin/env node
/**
 * ROW-216 — Bill Payments list must exclude settlement deductions.
 *
 * All 218 accounting.bill_payments rows created by the settlement close engine carry
 * settlement_deduction_noncash = true. These are non-cash credits applied to a driver's bill
 * (deduction applications), NOT cash payments. They must not appear on the global Bill Payments
 * list. The per-bill drill-through (listBillPaymentsForBill) correctly keeps them.
 *
 * Usage: node scripts/verify-bill-payments-list-excludes-deductions.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bill-payments-list-excludes-deductions";

const TARGET = "apps/backend/src/accounting/bills.service.ts";

function check(readFile) {
  const src = readFile(TARGET);
  if (src === null) return [`${TARGET}: not found`];
  const failures = [];
  if (!/settlement_deduction_noncash IS NOT TRUE/.test(src))
    failures.push(`${TARGET}: listBillPayments WHERE must include "settlement_deduction_noncash IS NOT TRUE" (ROW-216)`);
  // The per-bill drill-through must NOT filter out deductions (they belong on a bill's detail).
  const forBillFn = src.slice(src.indexOf("export async function listBillPaymentsForBill"));
  const forBillBody = forBillFn.slice(0, forBillFn.indexOf("\nexport async function ", 1) || forBillFn.length);
  if (/settlement_deduction_noncash/.test(forBillBody))
    failures.push(`${TARGET}: listBillPaymentsForBill must NOT filter settlement_deduction_noncash — deductions belong on a bill's own drill-through`);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = `
    const where: string[] = [
      "bp.operating_company_id = $1::uuid",
      "bp.settlement_deduction_noncash IS NOT TRUE",
    ];
    export async function listBillPaymentsForBill() {}
    export async function listBillPayments() {}
  `;
  const missing = `
    const where: string[] = ["bp.operating_company_id = $1::uuid"];
    export async function listBillPaymentsForBill() {}
    export async function listBillPayments() {}
  `;
  const gf = check((f) => (f === TARGET ? good : null));
  if (gf.length) { console.error(`${LABEL} selftest FAIL — good fixture should pass: ${gf.join("; ")}`); process.exit(1); }
  const bf = check((f) => (f === TARGET ? missing : null));
  if (!bf.some((e) => /settlement_deduction_noncash/.test(e))) { console.error(`${LABEL} selftest FAIL — bad fixture should be caught`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const failures = check((rel) => {
  const p = path.join(ROOT, rel);
  try { return readFileSync(p, "utf8"); } catch { return null; }
});
if (failures.length) {
  console.error(`[${LABEL}] FAILED:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — Bill Payments list excludes settlement deductions (settlement_deduction_noncash IS NOT TRUE)`);
