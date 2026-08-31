#!/usr/bin/env node
/**
 * SETL-NO-VOID-PATH-01 + BANK-ORPHAN-01 (owner ruling 2026-08-31/2026-09-01). driver_settlements has
 * always carried voided_at/void_reason/voided_by_user_id AND reversed_at/reversed_by_user_id/
 * reversal_reason, but nothing ever wrote any of the six columns from a route — 17 sample settlements
 * had no way to be undone. This guard locks two things at once:
 *
 *   1. settlements.routes.ts POST …/:id/reverse — reuses the SAME shared engine already wired for
 *      the governance executor (reverseSettlementBillPaymentInClientTx), gated Owner/Accountant only
 *      (void.service.ts's canVoid, never a locally re-declared role set), refuses a 'paid' settlement
 *      and a LOCKED settlement (requires the separate POST …/unlock first — never a silent bypass),
 *      and flips reversed_at/reversed_by_user_id/reversal_reason (not the unrelated voided_at set —
 *      this codebase's own prior decision, in governance/void-cancel-executors.ts's
 *      executeDriverSettlement, already answered void vs reverse for this entity type).
 *
 *   2. void.service.ts's BANK-ORPHAN-01 primitive — "the match is a property of the transaction, so
 *      it dies with it." postVoidReversal must unconditionally un-match any bank_transactions row
 *      pointed at the entity being voided (both the REVERSE pointer — bill/bill_payment/
 *      customer_payment.source_bank_transaction_id — and the FORWARD pointer —
 *      bank_transactions.linked_entity_id) before returning, so every existing caller (direct void
 *      routes, the load-cancel cascade, the governance executors, this settlement route) gets it for
 *      free with no per-caller wiring.
 *
 *   node scripts/verify-settlement-void-cascade.mjs
 *   node scripts/verify-settlement-void-cascade.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-void-cascade";
const ROUTES_FILE = "apps/backend/src/driver-finance/settlements.routes.ts";
const VOID_SERVICE_FILE = "apps/backend/src/accounting/void.service.ts";

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

export function assertRoutesGuard(src) {
  const errs = [];
  if (!src) return [`${ROUTES_FILE}: missing`];

  if (!/\/api\/v1\/driver-finance\/settlements\/:id\/reverse/.test(src)) {
    errs.push(`${ROUTES_FILE}: POST …/:id/reverse route is missing`);
  }
  if (!/\/api\/v1\/driver-finance\/settlements\/:id\/unlock/.test(src)) {
    errs.push(`${ROUTES_FILE}: POST …/:id/unlock route is missing`);
  }
  if (!/canVoid\(role\)/.test(src)) {
    errs.push(`${ROUTES_FILE}: reversal must be gated by the shared void.service.ts canVoid (Owner+Accountant), not a locally re-declared role set`);
  }
  if (!/reverseSettlementBillPaymentInClientTx\(/.test(src)) {
    errs.push(`${ROUTES_FILE}: must reuse the shared reverseSettlementBillPaymentInClientTx engine — no new GL math invented here`);
  }
  if (!/current\.status === "paid"/.test(src)) {
    errs.push(`${ROUTES_FILE}: a 'paid' settlement must be refused, not silently reversed — money already moved`);
  }
  if (!/current\.locked_at.*settlement_reverse_blocked_locked/.test(src) && !/settlement_reverse_blocked_locked/.test(src)) {
    errs.push(`${ROUTES_FILE}: a LOCKED settlement must block reversal (fail loud) rather than silently bypassing the lock`);
  }
  if (!/status = 'cancelled', reversed_at = now\(\), reversed_by_user_id/.test(src)) {
    errs.push(`${ROUTES_FILE}: reversal must flip reversed_at/reversed_by_user_id/reversal_reason together with status='cancelled' (the columns this codebase's own governance executor already uses for this entity type)`);
  }
  if (!/unmatchBankTransactionById\(/.test(src)) {
    errs.push(`${ROUTES_FILE}: must un-match driver_settlements.paid_via_bank_txn_id via the shared BANK-ORPHAN-01 primitive — a reversed settlement must not leave its own bank match categorized`);
  }
  if (!/settlement_lines\s*\n\s*SET is_active = false/.test(src)) {
    errs.push(`${ROUTES_FILE}: this settlement's own settlement_lines must be deactivated (is_active=false) on reversal — void-never-delete, no hard delete`);
  }
  if (!/"driver_finance\.driver_settlement\.reversed"/.test(src)) {
    errs.push(`${ROUTES_FILE}: reversal must be audited under a named, greppable event type`);
  }

  return errs;
}

export function assertBankOrphanGuard(src) {
  const errs = [];
  if (!src) return [`${VOID_SERVICE_FILE}: missing`];

  if (!/export async function unmatchBankTransactionsForVoid/.test(src)) {
    errs.push(`${VOID_SERVICE_FILE}: unmatchBankTransactionsForVoid primitive is missing`);
  }
  if (!/export async function unmatchBankTransactionById/.test(src)) {
    errs.push(`${VOID_SERVICE_FILE}: unmatchBankTransactionById primitive is missing (needed by callers with a direct bank_transaction_id column, e.g. driver_settlements.paid_via_bank_txn_id)`);
  }
  if (!/status = 'pending_categorization'/.test(src)) {
    errs.push(`${VOID_SERVICE_FILE}: un-match must return the bank transaction to 'pending_categorization' (the review worklist), not leave status untouched`);
  }
  if (!/linked_entity_id = \$2::uuid OR id = \$\{reverseIdSql\}/.test(src)) {
    errs.push(`${VOID_SERVICE_FILE}: must check BOTH pointer shapes (forward linked_entity_id AND reverse source_bank_transaction_id) in one statement — the 4 live orphans had linked_entity_id=NULL, so a forward-only check misses them`);
  }
  if (!/await unmatchBankTransactionsForVoid\(client, \{/.test(src)) {
    errs.push(`${VOID_SERVICE_FILE}: postVoidReversal must call unmatchBankTransactionsForVoid unconditionally so every existing caller inherits BANK-ORPHAN-01 for free`);
  }
  // The call must run BEFORE the "nothing to reverse" early return, not after it — an entity with
  // zero posted GL lines can still (in principle) carry a bank match, and the owner's rule has no
  // "only if something reversed" exception.
  const unmatchIdx = src.indexOf("await unmatchBankTransactionsForVoid(client, {");
  const earlyReturnIdx = src.indexOf("reversed_line_count: 0 };");
  if (unmatchIdx === -1 || earlyReturnIdx === -1 || unmatchIdx > earlyReturnIdx) {
    errs.push(`${VOID_SERVICE_FILE}: unmatchBankTransactionsForVoid must run BEFORE the zero-postings early return in postVoidReversal, not after`);
  }

  return errs;
}

function selftest() {
  const goodRoutes = read(ROUTES_FILE) ?? "";
  const goodVoidService = read(VOID_SERVICE_FILE) ?? "";
  const goodRoutesErrs = assertRoutesGuard(goodRoutes);
  const goodVoidErrs = assertBankOrphanGuard(goodVoidService);
  if (goodRoutesErrs.length) {
    console.error(`${LABEL} --selftest FAIL good-routes (${goodRoutesErrs.length}): ${goodRoutesErrs.join("; ")}`);
    process.exit(1);
  }
  if (goodVoidErrs.length) {
    console.error(`${LABEL} --selftest FAIL good-void-service (${goodVoidErrs.length}): ${goodVoidErrs.join("; ")}`);
    process.exit(1);
  }

  const routeMutations = [
    ["bad1-no-role-gate", assertRoutesGuard(goodRoutes.replace(/canVoid\(role\)/g, "true"))],
    ["bad2-no-shared-engine", assertRoutesGuard(goodRoutes.replace(/reverseSettlementBillPaymentInClientTx\(/g, "reverseSettlementBillPaymentInClientTxXXX("))],
    ["bad3-paid-not-protected", assertRoutesGuard(goodRoutes.replace(/current\.status === "paid"/g, "false"))],
    ["bad4-lock-bypassed", assertRoutesGuard(goodRoutes.replace(/settlement_reverse_blocked_locked/g, "REMOVED_CODE"))],
    ["bad5-no-bank-unmatch", assertRoutesGuard(goodRoutes.replace(/unmatchBankTransactionById\(/g, "unmatchBankTransactionByIdXXX("))],
    ["bad6-no-audit", assertRoutesGuard(goodRoutes.replace(/"driver_finance\.driver_settlement\.reversed"/g, '"driver_finance.driver_settlement.reversedXXX"'))],
  ];
  const voidServiceMutations = [
    ["bad7-forward-only", assertBankOrphanGuard(goodVoidService.replace("linked_entity_id = $2::uuid OR id = ${reverseIdSql}", "linked_entity_id = $2::uuid"))],
    ["bad8-not-called", assertBankOrphanGuard(goodVoidService.replace("await unmatchBankTransactionsForVoid(client, {", "await unmatchBankTransactionsForVoidXXX(client, {"))],
  ];

  for (const [name, res] of [...routeMutations, ...voidServiceMutations]) {
    if (res.length === 0) {
      console.error(`${LABEL} --selftest FAIL ${name}: mutation not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS ${routeMutations.length + voidServiceMutations.length}/${routeMutations.length + voidServiceMutations.length} mutations caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const routesErrs = assertRoutesGuard(read(ROUTES_FILE));
const voidServiceErrs = assertBankOrphanGuard(read(VOID_SERVICE_FILE));
const errs = [...routesErrs, ...voidServiceErrs];
if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — driver settlements have a real Owner/Accountant-gated reversal path (locked-settlement gate, shared GL engine, bank un-match) and postVoidReversal un-matches bank transactions for every voidable entity type`);
