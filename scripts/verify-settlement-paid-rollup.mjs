#!/usr/bin/env node
/**
 * ACCT-F11081 (register row 88) — a driver settlement's paid status is written from its REAL payment documents.
 *
 * Measured prod 2026-11-03: 0 of 85 closed USMCA settlements paid; the only writers of driver_settlements.payment_state /
 * paid_at were the manual Mark-Paid / ACH-rail buttons. payBill / voidBillPayment moved the per-load A/P bills but never
 * rolled up to the settlement. This guard pins:
 *   1. the rollup SQL counts REAL cash only (posted, not voided/revoked, not a non-cash deduction application, not sample),
 *      on LIVE spine rows of a POSTED run, and never reads bank lines (matching bank lines is owner-only);
 *   2. it marks paid only when every bill is open 0 AND real cash >= net pay AND net pay > 0;
 *   3. it reopens only what it wrote itself (source = 'bill_payment');
 *   4. it is called by payBill, voidBillPayment (same transaction) and by the settlement close after the spine rows exist.
 */
import fs from "node:fs";
import path from "node:path";
import { expandWith, loadPredicates } from "./lib/expand-live-document-predicates.mjs";
// sweepA (2026-11-10) — sources are read through the canonical predicate expander: a reader that spells the exclusion
// with the shared helper (`${notVoided("x")}`, `${liveDriverBill("db")}`, …, required by
// verify-live-document-predicates-single-source) is judged on the SQL the REAL helper emits. Deleting the helper call,
// or a helper body that stops emitting the predicate, still fails this guard.
const LIVE_PREDICATES = await loadPredicates();

const ROOT = process.cwd();
const FILES = {
  rollup: "apps/backend/src/driver-finance/settlement-paid-rollup.service.ts",
  bills: "apps/backend/src/accounting/bills.service.ts",
  apChain: "apps/backend/src/driver-finance/settlement-ap-chain.service.ts",
  routes: "apps/backend/src/driver-finance/settlement-payment.routes.ts",
};

function fnBody(src, signature) {
  const i = src.indexOf(signature);
  if (i < 0) return null;
  const next = src.slice(i + signature.length).search(/\n(export )?(async )?function /);
  return next < 0 ? src.slice(i) : src.slice(i, i + signature.length + next);
}

export function check(srcs) {
  const fails = [];
  const r = srcs.rollup ?? "";
  const sqlMatch = r.match(/SETTLEMENT_NET_PAID_SQL = `([\s\S]*?)`;/);
  const sql = sqlMatch ? sqlMatch[1] : "";
  if (!sql) fails.push("rollup: SETTLEMENT_NET_PAID_SQL missing");
  const mustSql = [
    ["coalesce(bp.settlement_deduction_noncash, false) = false", "non-cash deduction applications must not count as payment"],
    ["bp.voided_at IS NULL", "voided bill payments must not count"],
    ["bp.revoked_at IS NULL", "revoked bill payments must not count"],
    ["bp.status::text = 'posted'", "only posted bill payments count"],
    ["coalesce(bp.is_sample_data, false) = false", "sample bill payments must not count"],
    ["r.status = 'posted'", "only a posted GL run's bills count"],
    ["g.superseded_at IS NULL", "superseded spine rows must not count"],
    ["coalesce(bills.open_cents, 0) = 0", "every bill must be open 0"],
    ["coalesce(cash.cash_cents, 0) >= round(coalesce(s.net_pay, 0) * 100)", "real cash must cover net pay"],
    ["round(coalesce(s.net_pay, 0) * 100) > 0", "a settlement with no net pay has no payment document"],
    ["lpe.payload->>'source' = 'bill_payment'", "reopen only what this writer marked"],
  ];
  for (const [needle, why] of mustSql) if (!sql.includes(needle)) fails.push(`rollup SQL: ${why} (missing \`${needle}\`)`);
  if (/bank_transactions|matched_bill_payment_id|paid_via_bank_txn_id/.test(r)) fails.push("rollup: reads or writes bank-line linkage (owner-only)");
  if (!/source: "bill_payment"/.test(r)) fails.push("rollup: paid event payload must carry source 'bill_payment'");
  if (!/payment_state IS NOT DISTINCT FROM \$6/.test(r)) fails.push("rollup: mark-paid UPDATE must compare-and-swap on the observed state");
  if (!/appendCrudAudit\([^)]*"driver_pay\.settlement\.paid_from_bill_payment"/.test(r.replace(/\n/g, " "))) fails.push("rollup: mark-paid must be audited");
  const decide = fnBody(r, "export function decideSettlementPaidTransition");
  if (!decide || !/state === "unpaid" \|\| state === "queued" \|\| state === "bounced"/.test(decide)) fails.push("rollup: only unpaid/queued/bounced may move to paid");

  const b = srcs.bills ?? "";
  const pay = fnBody(b, "async function payBillRowInClientTx(");
  if (!pay || !pay.includes("rollupSettlementPaidStatusInClientTx(client, input.operatingCompanyId, { billIds: [input.billId] }")) fails.push("bills.service: payBillRowInClientTx does not roll the settlement's paid status");
  const vd = fnBody(b, "export async function voidBillPaymentInClientTx(");
  if (!vd || !vd.includes("rollupSettlementPaidStatusInClientTx(")) fails.push("bills.service: voidBillPaymentInClientTx does not reopen the settlement");

  const a = srcs.apChain ?? "";
  const ins = a.lastIndexOf("INSERT INTO driver_finance.driver_settlement_gl_bills");
  const call = a.indexOf("rollupSettlementPaidStatusInClientTx(client, opco, { settlementIds: [input.settlementId] }");
  if (call < 0 || ins < 0 || call < ins) fails.push("settlement-ap-chain: close must roll paid status AFTER writing its spine rows");

  if (!(srcs.routes ?? "").includes("/api/v1/driver-pay/settlements/repair-paid-status")) fails.push("routes: repair-paid-status route missing");
  return fails;
}

function readAll() {
  const out = {};
  for (const [k, rel] of Object.entries(FILES)) out[k] = fs.existsSync(path.join(ROOT, rel)) ? expandWith(LIVE_PREDICATES, fs.readFileSync(path.join(ROOT, rel), "utf8")) : "";
  return out;
}

function selftest() {
  const base = readAll();
  const clean = check(base);
  if (clean.length) {
    console.error("selftest: live tree must be clean first:\n  " + clean.join("\n  "));
    process.exit(1);
  }
  const plants = [
    ["noncash counted", { rollup: base.rollup.replace("AND coalesce(bp.settlement_deduction_noncash, false) = false", "") }],
    ["voided counted", { rollup: base.rollup.replace("AND bp.voided_at IS NULL\n", "\n") }],
    ["open bills allowed", { rollup: base.rollup.replace("AND coalesce(bills.open_cents, 0) = 0", "") }],
    ["bank line read", { rollup: base.rollup + "\n// banking.bank_transactions" }],
    ["payBill not wired", { bills: base.bills.replace("await rollupSettlementPaidStatusInClientTx(client, input.operatingCompanyId, { billIds: [input.billId] }, userId);", "") }],
    ["void not wired", { bills: base.bills.replace(/await rollupSettlementPaidStatusInClientTx\(client as never[^\n]*\n/, "") }],
    ["close not wired", { apChain: base.apChain.replace(/await rollupSettlementPaidStatusInClientTx\(client, opco[^\n]*\n/, "") }],
    ["paid from terminal state", { rollup: base.rollup.replace('state === "unpaid" || state === "queued" || state === "bounced"', 'true') }],
  ];
  let bad = 0;
  for (const [name, patch] of plants) {
    const fails = check({ ...base, ...patch });
    if (fails.length === 0) {
      console.error(`selftest: planted defect NOT caught: ${name}`);
      bad++;
    }
  }
  if (bad) process.exit(1);
  console.log(`verify-settlement-paid-rollup selftest: ${plants.length}/${plants.length} planted defects caught`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const fails = check(readAll());
  if (fails.length) {
    console.error("verify-settlement-paid-rollup FAILED:\n  " + fails.join("\n  "));
    process.exit(1);
  }
  console.log("verify-settlement-paid-rollup: OK");
}
