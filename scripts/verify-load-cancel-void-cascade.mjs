#!/usr/bin/env node
/**
 * VOID-CANCEL-NOT-VOID (owner-verified live 2026-09-01, Devin-A void-10 walk: L-20260830-0020 /
 * L-20260830-0024 — load cancelled, invoice STILL 'sent', voided_at NULL, void_reason NULL, no
 * reversing JE for either, $2,500.00 + $1,100.00 orphaned). Cancelling a load must NOT leave any
 * money artifact alive — invoices, driver bills, or settlements.
 *
 * PREVIOUS BEHAVIOR (superseded): any open driver_bills or settlement_lines BLOCKED the cancel
 * with a hard error. Owner ruling 2026-09-01: one-click cascade void — cancel MUST automatically
 * void driver bills and cancel settlements in the same transaction rather than throwing.
 *
 * WHAT THIS GUARD ASSERTS (updated to cascade law):
 *  1. Invoices: every live (non-void, non-paid, non-factored) invoice is voided with
 *     postVoidReversal (shared, no new GL math); paid/factored invoices fail loud.
 *  2. Driver bills: every non-void driver bill for the load is voided in-cascade (status='void').
 *     The guard must NOT see the old hard-gate error code — cascade, not block.
 *  3. Settlements: executeVoidCancel('driver_settlement'...) is called for each attached
 *     settlement (reuses reverseSettlementBillPaymentInClientTx, no new GL math).
 *     The guard must NOT see the old hard-gate error code — cascade, not block.
 *  4. Full sequence recorded in cancellation_money_artifacts audit.
 *
 *   node scripts/verify-load-cancel-void-cascade.mjs
 *   node scripts/verify-load-cancel-void-cascade.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-cancel-void-cascade";
const FILE = "apps/backend/src/dispatch/cancellation.service.ts";

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

export function assertGuard(src) {
  const errs = [];
  if (!src) return [`${FILE}: missing`];

  // 1. Invoices: still using postVoidReversal (no new GL math)
  if (!/postVoidReversal\(/.test(src)) {
    errs.push(`${FILE}: cancel must reuse the shared postVoidReversal — no new GL math invented for the cascade`);
  }
  // 2. Invoice query covers all live (non-void) invoices, not just proforma
  if (!/status <> 'void'/.test(src) || !/source_load_id = \$1::uuid/.test(src)) {
    errs.push(`${FILE}: must query every live (non-void) invoice for this load, not just proforma`);
  }
  // 3. Paid/factored invoices must be refused (fail loud), not silently voided
  if (!/r\.status === "paid" \|\| r\.status === "factored"/.test(src)) {
    errs.push(`${FILE}: a 'paid' or 'factored' invoice must be refused, not silently voided — real money already moved`);
  }
  if (!/load_cancel_blocked_unvoidable_invoice/.test(src)) {
    errs.push(`${FILE}: an unvoidable invoice must fail loud with a named error code, not warn-and-continue`);
  }
  // 4. Invoice void must write both status='void' AND voided_at (IFF constraint)
  if (!/status = 'void',\s*\n\s*voided_at = now\(\)/.test(src)) {
    errs.push(`${FILE}: the invoice void UPDATE must write status='void' and voided_at together (invoices_void_state_authoritative is an IFF — writing one without the other rolls back the whole cancel)`);
  }
  // 5. Invoice audited via shared auditVoid
  if (!/auditVoid\(client, userId, "invoice"/.test(src)) {
    errs.push(`${FILE}: each cascade invoice void must be audited through the shared auditVoid, not a bespoke audit shape`);
  }
  // 6. Driver bills: CASCADE VOID (must be present) — not hard-gate
  if (!/driver_finance\.driver_bills[\s\S]{0,200}status <> 'void'/.test(src)) {
    errs.push(`${FILE}: must query open driver bills (status <> 'void') for cascade void — no longer a hard gate`);
  }
  if (!/UPDATE driver_finance\.driver_bills[\s\S]{0,200}status = 'void'/.test(src)) {
    errs.push(`${FILE}: must void open driver bills in-cascade (UPDATE ... status = 'void') — no silent orphan`);
  }
  // 7. OLD hard-gate codes must NOT exist (replaced by cascade)
  if (/load_cancel_blocked_open_driver_bills/.test(src)) {
    errs.push(`${FILE}: old hard-gate 'load_cancel_blocked_open_driver_bills' still present — must be replaced with cascade void`);
  }
  if (/load_cancel_blocked_settlement_lines/.test(src)) {
    errs.push(`${FILE}: old hard-gate 'load_cancel_blocked_settlement_lines' still present — must be replaced with cascade cancel`);
  }
  // 8. Settlements: executeVoidCancel('driver_settlement'...) called for cascade cancel
  if (!/executeVoidCancel\(["']driver_settlement["']/.test(src)) {
    errs.push(`${FILE}: must call executeVoidCancel('driver_settlement'...) for each attached settlement — cascade cancel, not hard gate`);
  }
  // 9. All three artifact sets recorded in the money-artifacts audit
  if (!/cancellation_money_artifacts/.test(src)) {
    errs.push(`${FILE}: no durable record of what cancellation did to the money artifacts (cancellation_money_artifacts)`);
  }
  if (!/driver_bills_voided/.test(src)) {
    errs.push(`${FILE}: cancellation_money_artifacts must record driver_bills_voided`);
  }
  if (!/settlements_cancelled/.test(src)) {
    errs.push(`${FILE}: cancellation_money_artifacts must record settlements_cancelled`);
  }
  if (!/invoices_voided/.test(src)) {
    errs.push(`${FILE}: cancellation_money_artifacts must record invoices_voided`);
  }

  return errs;
}

function selftest() {
  const good = read(FILE) ?? "";
  const goodErrs = assertGuard(good);
  if (goodErrs.length) {
    console.error(`${LABEL} --selftest FAIL good (${goodErrs.length}): ${goodErrs.join("; ")}`);
    process.exit(1);
  }

  const bad1 = assertGuard(good.replace(/postVoidReversal\(/g, "/* removed */postVoidReversalXXX("));
  const bad2 = assertGuard(good.replace('r.status === "paid" || r.status === "factored"', "false"));
  const bad3 = assertGuard(good.replace(/load_cancel_blocked_unvoidable_invoice/g, "REMOVED_CODE"));
  const bad4 = assertGuard(good.replace(/UPDATE driver_finance\.driver_bills[\s\S]{0,200}status = 'void'/m, "/* REMOVED driver bill void */"));
  const bad5 = assertGuard(good.replace(/executeVoidCancel\(["']driver_settlement["']/, "executeVoidCancelXXX('driver_settlement'"));
  const bad6 = assertGuard(good.replace('auditVoid(client, userId, "invoice"', 'auditVoid(client, userId, "invoiceXXX"'));

  for (const [name, res] of [
    ["bad1-no-shared-reversal", bad1],
    ["bad2-paid-not-protected", bad2],
    ["bad3-no-fail-loud-invoice", bad3],
    ["bad4-driver-bills-not-voided", bad4],
    ["bad5-settlements-not-cascaded", bad5],
    ["bad6-no-invoice-audit", bad6],
  ]) {
    if (res.length === 0) {
      console.error(`${LABEL} --selftest FAIL ${name}: mutation not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS 6/6 mutations caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = read(FILE);
const errs = assertGuard(src);
if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — cancelling a load voids every live invoice with a reversal, voids open driver bills, cancels attached settlements in-cascade; paid/factored invoices refused; all artifacts recorded`);
