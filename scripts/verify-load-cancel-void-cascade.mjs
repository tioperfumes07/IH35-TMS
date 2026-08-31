#!/usr/bin/env node
/**
 * VOID-CANCEL-NOT-VOID (owner-verified live 2026-09-01, Devin-A void-10 walk: L-20260830-0020 /
 * L-20260830-0024 — load cancelled, invoice STILL 'sent', voided_at NULL, void_reason NULL, no
 * reversing JE for either, $2,500.00 + $1,100.00 orphaned). Cancelling a load used to leave every
 * live (non-void) invoice on it alive, with no reversal — a WORM violation at the point where WORM
 * matters most. This guard locks the fix in cancellation.service.ts: EVERY live invoice on a
 * cancelled load is voided with a reversing JE (reusing the shared postVoidReversal, no new GL
 * math); a 'paid' or 'factored' invoice is refused (fails loud, changes nothing) rather than
 * silently voided; any OPEN driver_bills or attached settlement_lines block the cancel entirely
 * (fail loud, no silent orphan, no invented driver-bill void logic) rather than proceeding around
 * them.
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

  if (!/postVoidReversal\(/.test(src)) {
    errs.push(`${FILE}: cancel must reuse the shared postVoidReversal — no new GL math invented for the cascade`);
  }
  if (!/status <> 'void'/.test(src) || !/source_load_id = \$1::uuid/.test(src)) {
    errs.push(`${FILE}: must query every live (non-void) invoice for this load, not just proforma`);
  }
  if (!/r\.status === "paid" \|\| r\.status === "factored"/.test(src)) {
    errs.push(`${FILE}: a 'paid' or 'factored' invoice must be refused, not silently voided — real money already moved`);
  }
  if (!/load_cancel_blocked_unvoidable_invoice/.test(src)) {
    errs.push(`${FILE}: an unvoidable invoice must fail loud with a named error code, not warn-and-continue`);
  }
  if (!/load_cancel_blocked_open_driver_bills/.test(src)) {
    errs.push(`${FILE}: an open driver bill on the load must block the cancel (fail loud), not be silently orphaned`);
  }
  if (!/load_cancel_blocked_settlement_lines/.test(src)) {
    errs.push(`${FILE}: an attached settlement line must block the cancel (fail loud), not be silently orphaned`);
  }
  if (!/status = 'void',\s*\n\s*voided_at = now\(\)/.test(src)) {
    errs.push(`${FILE}: the invoice void UPDATE must write status='void' and voided_at together (invoices_void_state_authoritative is an IFF — writing one without the other rolls back the whole cancel)`);
  }
  if (!/auditVoid\(client, userId, "invoice"/.test(src)) {
    errs.push(`${FILE}: each cascade void must be audited through the shared auditVoid, not a bespoke audit shape`);
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
  const bad4 = assertGuard(good.replace(/load_cancel_blocked_open_driver_bills/g, "REMOVED_CODE"));
  const bad5 = assertGuard(good.replace(/load_cancel_blocked_settlement_lines/g, "REMOVED_CODE"));
  const bad6 = assertGuard(good.replace('auditVoid(client, userId, "invoice"', 'auditVoid(client, userId, "invoiceXXX"'));

  for (const [name, res] of [
    ["bad1-no-shared-reversal", bad1],
    ["bad2-paid-not-protected", bad2],
    ["bad3-no-fail-loud-invoice", bad3],
    ["bad4-driver-bills-not-gated", bad4],
    ["bad5-settlement-lines-not-gated", bad5],
    ["bad6-no-audit", bad6],
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
console.log(`[${LABEL}] OK — cancelling a load voids every live invoice with a reversal, refuses to silently touch paid/factored invoices or open driver bills/settlement lines`);
