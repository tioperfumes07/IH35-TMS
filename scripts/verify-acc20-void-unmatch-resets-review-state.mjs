#!/usr/bin/env node
// ACC-20 (owner-defect register 2026-09-03, CC-2/Banking): "No automatic un-categorize in either
// direction when a match is reversed." Two release paths exist for a bank transaction's match:
//   1. Manual: reconciliation.routes.ts's POST .../unmatch — already resets review_state='for_review'.
//   2. Automatic (void cascade): void.service.ts's unmatchBankTransactionById /
//      unmatchBankTransactionsForVoid, sharing ONE reset SQL (BANK_TX_UNMATCH_RESET_SQL) — this used
//      to clear every matched_*_id/categorization_* pointer and flip `status`, but never touched
//      `review_state`, leaving it stuck at 'matched' (or 'categorized') forever. Two real consequences:
//   (a) match.service.ts's own confirm-match idempotency guard (`if (txn.review_state === "matched")
//       throw`) permanently refuses to re-match a transaction this exact reset just released.
//   (b) review_state is the CHECK-constrained, canonical "what state is this transaction in" column —
//       a stale value there is a real orphan, not just a display glitch.
// This guard pins BOTH release paths to the SAME review_state='for_review' behavior.
//
// node scripts/verify-acc20-void-unmatch-resets-review-state.mjs
// node scripts/verify-acc20-void-unmatch-resets-review-state.mjs --selftest
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VOID_SERVICE = "apps/backend/src/accounting/void.service.ts";
const RECON_ROUTES = "apps/backend/src/banking/reconciliation.routes.ts";
const RECON_WORKLIST = "apps/backend/src/accounting/bank-recon/recon-worklist.service.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(cond, msg, errors) {
  if (!cond) errors.push(msg);
}

// LST-F408 (Lead, 2026-10-04): the checks are a pure function of the two source TEXTS, so the selftest plants a defect into
// a string — it never writes a file. (It used to writeFileSync the planted text into apps/backend/src/accounting/
// void.service.ts and restore it in `finally`: any interrupted run, or a commit made meanwhile, carried the mutation.)
export function run(voidService = read(VOID_SERVICE), reconRoutes = read(RECON_ROUTES), reconWorklist = read(RECON_WORKLIST)) {
  const errors = [];

  const resetBlockMatch = voidService.match(/const BANK_TX_UNMATCH_RESET_SQL = `[\s\S]*?`;/);
  assert(!!resetBlockMatch, `${VOID_SERVICE}: could not locate BANK_TX_UNMATCH_RESET_SQL — guard markers moved`, errors);
  const resetBlock = resetBlockMatch ? resetBlockMatch[0] : "";

  assert(
    /review_state\s*=\s*'for_review'/.test(resetBlock),
    `${VOID_SERVICE}: BANK_TX_UNMATCH_RESET_SQL (the shared void-cascade unmatch reset, used by both unmatchBankTransactionById and unmatchBankTransactionsForVoid) must reset review_state = 'for_review' — leaving it untouched strands the transaction at a stale 'matched'/'categorized' state that match.service.ts's own idempotency guard then refuses to ever re-match`,
    errors
  );
  assert(
    !/review_state\s*=\s*'unmatched'/.test(resetBlock),
    `${VOID_SERVICE}: 'unmatched' is not a legal review_state (CHECK constraint: for_review|categorized|excluded|matched|transfer) — must be 'for_review'`,
    errors
  );
  assert(
    /status\s*=\s*'pending_categorization'/.test(resetBlock),
    `${VOID_SERVICE}: BANK_TX_UNMATCH_RESET_SQL must still reset status = 'pending_categorization' (unchanged by this guard — the categorize-endpoint gate reads this column)`,
    errors
  );

  // The sibling manual-unmatch route must keep doing the same thing, so the two paths can never
  // silently diverge again.
  // The manual /unmatch route no longer writes SQL itself — it delegates to unmatchBankTransaction (recon-worklist.service.ts),
  // which is where the sibling reset now lives. Follow the delegation; never accept the route without it.
  assert(
    /unmatchBankTransaction\(/.test(reconRoutes),
    `${RECON_ROUTES}: the manual /unmatch route must delegate to unmatchBankTransaction (the one manual-unmatch door)`,
    errors
  );
  const unmatchFn = reconWorklist.slice(reconWorklist.indexOf("export async function unmatchBankTransaction"));
  assert(
    /export async function unmatchBankTransaction/.test(reconWorklist) && /review_state\s*=\s*'for_review'/.test(unmatchFn.slice(0, 6000)),
    `${RECON_WORKLIST}: unmatchBankTransaction (the manual /unmatch door) must reset review_state = 'for_review' (the sibling behavior this guard keeps the void-cascade path in line with)`,
    errors
  );

  return errors;
}

function selftest() {
  const source = read(VOID_SERVICE);
  const planted = source.replace("review_state = 'for_review',\n         matched_journal_entry_id = NULL,", "matched_journal_entry_id = NULL,");
  if (planted === source) {
    throw new Error("selftest setup failed: expected source text not found (guard markers stale)");
  }
  // Fixture for the sibling route (LST-F407: a selftest never depends on the real tree's current state).
  const routesFixture = "await unmatchBankTransaction({ companyId, bankTransactionId });";
  const worklistFixture = "export async function unmatchBankTransaction(input) { await q(`UPDATE banking.bank_transactions SET review_state = 'for_review'`); }";
  const errors = run(planted, routesFixture, worklistFixture);
  // and the sibling door is checked too: a delegated service that stops resetting is caught.
  const sibling = run(source, routesFixture, worklistFixture.replace("review_state = 'for_review'", "status = 'x'"));
  if (!sibling.some((e) => e.includes("unmatchBankTransaction (the manual /unmatch door) must reset"))) {
    throw new Error("planted removal of the manual-unmatch reset not detected");
  }
  if (!errors.some((e) => e.includes("must reset review_state = 'for_review'"))) {
    throw new Error("planted removal of review_state reset not detected");
  }
  console.log("[verify-acc20-void-unmatch-resets-review-state] SELFTEST PASS (2 planted failures detected; no file written)");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = run();
  if (errors.length) {
    console.error("\n[verify-acc20-void-unmatch-resets-review-state] FAILED:\n");
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log("[verify-acc20-void-unmatch-resets-review-state] All checks passed ✓ (both match-release paths reset review_state consistently)");
}

main();
