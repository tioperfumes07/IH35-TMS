#!/usr/bin/env node
// ROUND 300 (CC-1, proven on a Neon fork) — ONE engine undoes a driver settlement: the canonical document reverser
// (voidDocument('settlement') -> reverseSettlementForVoid -> reverseSettlementBillPaymentInClientTx). Before: the
// per-load A/P chain (today's only settlement poster) could not be undone — the canonical path threw
// settlement_deduction_reconciliation_failed, and settlement-payrun-reverse reported "reversed" after netting only the
// application JE (bills, bill payments and their JEs stayed posted; settlement still 'closed'). This guard fails if:
//   1. reverseSettlementBillPaymentInClientTx stops detecting a chain-posted settlement (posted payrun_gl_runs whose
//      journal_entry_id is the application JE or a bill JE) or stops unwinding its pay-run sub-ledgers
//      (unwindPayRunSubledgersInClientTx with the recoveries from loadPayRunRecoveryReversal);
//   2. it voids only one non-cash application per bill instead of every settlement_deduction_noncash payment;
//   3. settlement-payrun-reverse stops delegating a chain-posted settlement to reverseSettlementForVoid (a second,
//      partial reverser for the same document);
//   4. the sub-ledger unwind is duplicated again (escrow_ledger 'release' / payrun_gl_runs void written outside the
//      shared helper in the reverse services).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-one-settlement-reverser";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  canonical: "apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts",
  payrun: "apps/backend/src/driver-finance/settlement-payrun-reverse.service.ts",
  unwind: "apps/backend/src/driver-finance/settlement-payrun-subledger-unwind.service.ts",
  callees: "apps/backend/src/driver-finance/void-document-callees.service.ts",
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

export function problems(src) {
  const p = [];
  const c = strip(src.canonical);
  const rev = c.slice(c.indexOf("export async function reverseSettlementBillPaymentInClientTx"));
  if (!/FROM driver_finance\.payrun_gl_runs[\s\S]{0,200}status = 'posted'/.test(rev) || !/payrunRow\.journal_entry_id === run\.deduction_journal_entry_id/.test(rev)) p.push("the canonical reverser must detect a chain-posted settlement (posted payrun_gl_runs on the application / bill JE)");
  if (!/loadPayRunRecoveryReversal\(/.test(rev) || !/await unwindPayRunSubledgersInClientTx\(/.test(rev)) p.push("the canonical reverser must unwind the pay-run sub-ledgers (advances, escrow, disbursement, pay-run run)");
  if (!/settlement_deduction_noncash = true/.test(rev) || !/for \(const paymentId of noncashIds\)/.test(rev)) p.push("every non-cash settlement application on each bill must be voided (settlement_deduction_noncash), not only deduction_bill_payment_id");
  const pr = strip(src.payrun);
  if (!/FROM driver_finance\.driver_settlement_gl_runs[\s\S]{0,400}if \(chainRun\.rows\[0\]\)\s*\{\s*const voided = await reverseSettlementForVoid\(/.test(pr)) p.push("settlement-payrun-reverse must delegate a chain-posted settlement to reverseSettlementForVoid");
  for (const [name, s] of [["settlement-payrun-reverse", pr], ["settlement-bill-payment-posting", c]]) {
    if (/INSERT INTO driver_finance\.escrow_ledger/.test(s) || /UPDATE driver_finance\.payrun_gl_runs\s+SET status = 'void'/.test(s)) p.push(`${name} writes the pay-run sub-ledger unwind itself — it belongs to settlement-payrun-subledger-unwind.service.ts only`);
  }
  const u = strip(src.unwind);
  if (!/export async function unwindPayRunSubledgersInClientTx/.test(u) || !/INSERT INTO driver_finance\.escrow_ledger/.test(u) || !/SET status = 'void'/.test(u)) p.push("the shared sub-ledger unwind is missing its escrow ledger release / pay-run void");
  if (!/payrunUnwind: reversal\.payrun_unwind/.test(strip(src.callees))) p.push("reverseSettlementForVoid must return the pay-run unwind");
  return p;
}

export function run() {
  return problems(Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")])));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")]));
  const own = problems(src);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["no chain detection", { ...src, canonical: src.canonical.replace("payrunRow.journal_entry_id === run.deduction_journal_entry_id", "false") }],
      ["no unwind", { ...src, canonical: src.canonical.replace("await unwindPayRunSubledgersInClientTx(", "await noop(") }],
      ["one noncash only", { ...src, canonical: src.canonical.replaceAll("settlement_deduction_noncash = true", "false") }],
      ["payrun half-reverses again", { ...src, payrun: src.payrun.replace("const voided = await reverseSettlementForVoid(", "const voided = await noop(") }],
      ["unwind duplicated", { ...src, payrun: src.payrun + "\nawait client.query(`INSERT INTO driver_finance.escrow_ledger (x) VALUES (1)`);" }],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL —\n  ${own.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — one engine undoes a driver settlement (voidDocument('settlement')); the pay-run reverser delegates chain-posted settlements to it.`);
}
