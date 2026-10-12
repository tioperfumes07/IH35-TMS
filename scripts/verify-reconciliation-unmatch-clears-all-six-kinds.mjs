#!/usr/bin/env node
/**
 * BANK-RECON-UNMATCH-CLEARS-ONLY-THREE-OF-SIX-MATCH-KINDS — the reconciliation workspace classifies
 * and renders six persisted match FKs (load, bill, settlement, expense, transfer, journal entry —
 * see ReconciliationWorkspace.tsx's 6 EntityLinks), but `POST /api/v1/banking/reconciliation/
 * :sessionId/unmatch` only cleared matched_load_id/matched_bill_id/matched_settlement_id and still
 * returned {ok: true}. An expense-, transfer-, or JE-matched transaction stayed matched after Unmatch.
 * Root cause: those 3 kinds are written by a SEPARATE subsystem (accounting/bank-recon/
 * match.service.ts's accept flow, denormalized onto the same bank_transactions row per
 * MATCHED_COLUMN_BY_KIND) that this route never accounted for.
 *
 * INVARIANT (static — no database): the unmatch handler's UPDATE must clear all 6 matched_*_id
 * columns the frontend renders, and for the 3 "other subsystem" kinds (expense/transfer/je) it must
 * also record a 'rejected' row in banking.reconciliation_matches — that table is the other
 * subsystem's own audit-of-record, and a bare NULL with no trace there would let a future
 * match-suggestion pass re-surface the exact same pairing with no memory of the unmatch.
 *
 * RE-ANCHORED 443.99 — the law moved twice, the invariant did not:
 *   - ROUND 288.2 item 2 (a9d5446a14, #24158): ONE unmatch writer. The route's inline UPDATE was deleted; it gates on the
 *     session and calls unmatchBankTransaction -> undoBankLineOnClient (bank-line state machine) -> for a 'matched' line,
 *     unmatchBankTransactionOnClient (accounting/bank-recon/unmatch-bank-transaction.service.ts) — the one place the
 *     pointers clear.
 *   - ROUND 363-CC3-B / LAW 363.9 (03f4753223): the memory of an unmatch is no longer a row flipped to 'rejected' in
 *     place; releaseBankLineMatches() writes a 'released' row (who, when, why) beside the accepted match BEFORE the
 *     pointers clear, and the deferred trigger trg_send_back_keeps_the_match refuses a commit that skipped it.
 * So the guard now follows the chain and requires, at the one writer: all 6 rendered pointers cleared, the pre-clear
 * expense/transfer/journal-entry ids captured, and the release recorded before the clear.
 *
 * Self-test: node scripts/verify-reconciliation-unmatch-clears-all-six-kinds.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/banking/reconciliation.routes.ts";
const WORKLIST = "apps/backend/src/accounting/bank-recon/recon-worklist.service.ts";
const MACHINE = "apps/backend/src/banking/bank-line-state-machine.service.ts";
const WRITER = "apps/backend/src/accounting/bank-recon/unmatch-bank-transaction.service.ts";
const LABEL = "verify-reconciliation-unmatch-clears-all-six-kinds";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function fnBody(src, signature) {
  const at = src.indexOf(signature);
  if (at === -1) return null;
  const rest = src.slice(at + signature.length);
  const end = rest.search(/\n(?:export\s+)?(?:async\s+)?function\s/);
  return src.slice(at, end === -1 ? src.length : at + signature.length + end);
}

/** @param {{route: string, worklist: string, machine: string, writer: string}} s */
export function checkUnmatchClearsAllSixKinds(s) {
  const problems = [];

  // 1 — the route gates on the session and delegates to the one writer; it never clears pointers itself.
  const start = s.route.indexOf('"/api/v1/banking/reconciliation/:sessionId/unmatch"');
  if (start === -1) return [`${TARGET}: could not locate the /unmatch route handler`];
  const next = s.route.slice(start + 10).search(/\n\s*app\.(?:get|post|put|patch|delete)\(/);
  const handler = s.route.slice(start, next === -1 ? undefined : start + 10 + next);
  if (!/await unmatchBankTransaction\(\{/.test(handler)) problems.push(`${TARGET}: the /unmatch handler no longer delegates to unmatchBankTransaction (the one unmatch writer)`);
  if (/UPDATE\s+banking\.bank_transactions/.test(handler)) problems.push(`${TARGET}: the /unmatch handler writes banking.bank_transactions inline again — a second unmatch writer`);

  // 2 — unmatchBankTransaction runs the bank-line state machine, whose 'matched' branch calls the one writer.
  const um = fnBody(s.worklist, "export async function unmatchBankTransaction(");
  if (!um || !/undoBankLineOnClient\(client,/.test(um)) problems.push(`${WORKLIST}: unmatchBankTransaction no longer runs undoBankLineOnClient`);
  if (!/resolution_kind === "matched"\)\s*\{[\s\S]{0,400}?unmatchBankTransactionOnClient\(client,/.test(s.machine)) problems.push(`${MACHINE}: a 'matched' line no longer unmatches through unmatchBankTransactionOnClient`);

  // 3 — the one writer: release recorded BEFORE the clear, all 6 rendered pointers cleared, pre-clear ids captured.
  const w = fnBody(s.writer, "export async function unmatchBankTransactionOnClient(");
  if (!w) return [...problems, `${WRITER}: unmatchBankTransactionOnClient not found`];
  const release = w.search(/await releaseBankLineMatches\(client,/);
  const clear = w.search(/UPDATE banking\.bank_transactions bt/);
  if (release === -1) problems.push(`${WRITER}: the unmatch no longer records the release (releaseBankLineMatches, LAW 363.9) — the unmatch would leave no memory`);
  if (clear === -1) problems.push(`${WRITER}: the pointer-clearing UPDATE was not found`);
  if (release !== -1 && clear !== -1 && release > clear) problems.push(`${WRITER}: the release is recorded AFTER the pointers clear — it must be written first (LAW 363.9)`);
  for (const col of ["matched_load_id", "matched_bill_id", "matched_settlement_id", "matched_expense_id", "matched_transfer_id", "matched_journal_entry_id"]) {
    if (!new RegExp(`${col} = NULL`).test(w)) problems.push(`${WRITER}: unmatch no longer clears "${col} = NULL"`);
  }
  if (!/prev_expense_id/.test(w) || !/prev_transfer_id/.test(w) || !/prev_journal_entry_id/.test(w)) {
    problems.push(`${WRITER}: unmatch no longer captures the pre-clear expense/transfer/journal_entry ids`);
  }
  return problems;
}

function loadReal() {
  return { route: read(TARGET), worklist: read(WORKLIST), machine: read(MACHINE), writer: read(WRITER) };
}

function selftest() {
  const real = loadReal();
  const base = checkUnmatchClearsAllSixKinds(real);
  if (base.length) {
    console.error(`${LABEL} SELFTEST FAIL — real sources flagged: ${base.join("; ")}`);
    process.exit(1);
  }
  const mutations = [
    ["expense pointer not cleared", { ...real, writer: real.writer.replace(/matched_expense_id = NULL,/, "") }],
    ["journal-entry pointer not cleared", { ...real, writer: real.writer.replace(/matched_journal_entry_id = NULL,/, "") }],
    ["load pointer not cleared", { ...real, writer: real.writer.replace(/matched_load_id = NULL,/, "") }],
    ["release not recorded", { ...real, writer: real.writer.replace("await releaseBankLineMatches(client,", "await noop(client,") }],
    ["pre-clear ids not captured", { ...real, writer: real.writer.replace(/prev_journal_entry_id/g, "x") }],
    ["route writes inline again", { ...real, route: real.route.replace('"/api/v1/banking/reconciliation/:sessionId/unmatch"', '"/api/v1/banking/reconciliation/:sessionId/unmatch", await client.query(`UPDATE banking.bank_transactions SET matched_load_id = NULL`)') }],
    ["route stops delegating", { ...real, route: real.route.replace(/await unmatchBankTransaction\(\{/, "await somethingElse({") }],
    ["state machine bypasses the writer", { ...real, machine: real.machine.replace(/(resolution_kind === "matched"\)\s*\{[\s\S]{0,400}?)unmatchBankTransactionOnClient\(client,/, "$1otherUnmatch(client,") }],
  ];
  for (const [name, mutated] of mutations) {
    if (JSON.stringify(mutated) === JSON.stringify(real)) {
      console.error(`${LABEL} SELFTEST SETUP FAILED — mutation "${name}" did not change the source`);
      process.exit(1);
    }
    if (checkUnmatchClearsAllSixKinds(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — regression "${name}" escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — real chain clean; ${mutations.length} regression mutations all detected`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const failures = checkUnmatchClearsAllSixKinds(loadReal());
if (failures.length) {
  console.error(`[${LABEL}] FAILED:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — the one unmatch writer clears all 6 matched_*_id columns and records the release first (LAW 363.9)`);
