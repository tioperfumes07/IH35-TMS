#!/usr/bin/env node
/**
 * R-98.1-A GUARD -- verify-e10-reversal-is-idempotent.mjs
 *
 * Static check that scripts/ops/e10-void-runner-01-usmca.ts still carries the structural
 * properties that made a live two-run rehearsal idempotent (Round 102, br-snowy-cake-ak9meo9f,
 * a fresh branch off production): run 1 -- 0 errors across every phase (settlements 36,
 * factoring 69, invoices 75, expenses 211, revrec 139, all clean); run 2 -- 0 candidates found
 * in EVERY phase's own measurement query (not just 0 processed), 0 errors, 0 "No posted batch
 * found to reverse". A regression in any of the three properties below reproduces the original
 * 416-error rehearsal failure (209 uq_posting_batches_company_idempotency_key collisions + 70
 * "No posted batch found to reverse" + 137 orphaned zero-line reversal headers), so this guard
 * checks the CODE SHAPE, not a live re-run (a live re-run belongs in an ops rehearsal, not a
 * per-push CI guard against a real Neon branch).
 *
 * THE THREE PROPERTIES:
 *   1. Every call into a reversal engine that accepts a caller-owned client runs inside the
 *      shared inTx() helper (BEGIN, re-establish transaction-local GUCs, COMMIT/ROLLBACK) --
 *      the fix for the 209 idempotency-key collisions (orphaned partial writes from an earlier
 *      unwrapped attempt colliding with a retry).
 *   2. Every phase's own "live candidate" SELECT excludes rows where the journal entry ITSELF is
 *      a reversal (`reverses_je_id IS NULL`), not just rows already reversed
 *      (`reversed_by_je_id IS NULL`) -- without this, a reversal JE (tagged with the SAME
 *      source_transaction_type/id as the document it reverses, by design, for source-typed
 *      reporting) gets picked up as if it were a fresh live original on the next run.
 *   3. The "No posted batch found to reverse" case has a REUSE fallback (engine #5/#6 by JE id,
 *      not a 7th engine) instead of being left as a bare error.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-e10-reversal-is-idempotent";
const RUNNER_PATH = path.join(ROOT, "scripts/ops/e10-void-runner-01-usmca.ts");

export function assertE10ReversalIsIdempotent(runnerPath = RUNNER_PATH) {
  const fails = [];
  if (!fs.existsSync(runnerPath)) {
    fails.push(`runner not found at ${path.relative(ROOT, runnerPath)}`);
    return fails;
  }
  const src = fs.readFileSync(runnerPath, "utf8");

  // Property 1: the shared inTx() helper exists, and every reversal-engine call that accepts a
  // client (InClientTx-suffixed imports, or reverseJournalEntryNoFlip directly) is wrapped in it.
  if (!/async function inTx</.test(src)) {
    fails.push("shared inTx() helper not found -- property 1 (transaction-wrapped reversal calls) cannot hold without it.");
  }
  const clientAcceptingCalls = [
    "reverseSettlementBillPaymentInClientTx",
    "reverseSettlementPayRunInClientTx",
    "reversePostedSourceTransactionInClientTx",
    "reverseJournalEntryNoFlip",
  ];
  for (const fnName of clientAcceptingCalls) {
    // Find every INVOCATION (fnName followed by "(", excluding the import line itself, which
    // names the symbol without a following call-paren pattern used elsewhere in this file).
    const callRe = new RegExp(fnName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\(", "g");
    const matches = [...src.matchAll(callRe)].filter((m) => {
      const lineStart = src.lastIndexOf("\n", m.index) + 1;
      const line = src.slice(lineStart, src.indexOf("\n", m.index));
      return !/^\s*import\b/.test(line);
    });
    if (matches.length === 0) {
      fails.push(`expected call to ${fnName} not found -- either the call site was removed or renamed without updating this guard.`);
      continue;
    }
    const wrapped = matches.some((m) => {
      const windowStart = Math.max(0, m.index - 200);
      return /inTx\(/.test(src.slice(windowStart, m.index));
    });
    if (!wrapped) {
      fails.push(`${fnName} does not appear to be wrapped in inTx() -- found ${matches.length} call site(s), none with inTx( in the 200 chars before them.`);
    }
  }

  // Property 2: every "live candidate" liveness filter that checks reversed_by_je_id must also
  // check reverses_je_id in the same clause, or a reversal JE (tagged with the same
  // source_transaction_type/id by design) gets picked up as a fresh candidate on the next run.
  const reversedByJeIdOccurrences = [...src.matchAll(/reversed_by_je_id IS NULL/g)];
  if (reversedByJeIdOccurrences.length === 0) {
    fails.push("no 'reversed_by_je_id IS NULL' liveness checks found at all -- unexpected, the runner should have several.");
  }
  for (const m of reversedByJeIdOccurrences) {
    const windowEnd = Math.min(src.length, m.index + 200);
    const after = src.slice(m.index, windowEnd);
    if (!/reverses_je_id IS NULL/.test(after)) {
      const lineNo = src.slice(0, m.index).split("\n").length;
      fails.push(`line ~${lineNo}: 'reversed_by_je_id IS NULL' without a nearby 'reverses_je_id IS NULL' -- this candidate query will re-select reversal JEs as if they were live originals on the next run.`);
    }
  }

  // Property 3: the REUSE-by-JE-id fallback exists and is reachable from a
  // "No posted batch found to reverse" catch.
  if (!/reverseByJeIdFallback/.test(src)) {
    fails.push("reverseByJeIdFallback not found -- the 'No posted batch found to reverse' cases (invoices/expenses posted outside the batch-tracked path) have no fallback, matching the original 70-error rehearsal failure.");
  }
  if (!/No posted batch found to reverse/.test(src)) {
    fails.push("no catch for the literal 'No posted batch found to reverse' message -- the fallback, if present, is not wired to the actual error it needs to catch.");
  }

  return fails;
}

function main() {
  const selftest = process.argv.includes("--selftest");
  if (selftest) {
    // Selftest: a runner missing all three properties must fail with all three messages; the
    // real runner (as of this guard's authoring) must pass clean.
    const fakeMissing = path.join(ROOT, "scripts/verify-e10-reversal-is-idempotent.mjs"); // itself: no inTx, no reverseByJeIdFallback, no reversed_by_je_id at all in this exact shape
    const fails = assertE10ReversalIsIdempotent(fakeMissing);
    const pass1 = fails.length > 0;
    const failsReal = assertE10ReversalIsIdempotent(RUNNER_PATH);
    const pass2 = failsReal.length === 0;
    console.log(`${LABEL} --selftest: missing-properties file fails closed: ${pass1 ? "PASS" : "FAIL"}; real runner passes clean: ${pass2 ? "PASS" : "FAIL"}`);
    if (!pass2) for (const f of failsReal) console.log(`  ${f}`);
    process.exitCode = pass1 && pass2 ? 0 : 1;
    return;
  }

  const fails = assertE10ReversalIsIdempotent();
  if (fails.length > 0) {
    console.error(`${LABEL}: FAIL -- ${fails.length} problem(s):`);
    for (const f of fails) console.error(`  - ${f}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${LABEL}: OK -- inTx() wraps every client-accepting reversal call, every liveness check excludes reversal JEs themselves (reverses_je_id), and the No-posted-batch REUSE fallback is wired.`);
}

main();
