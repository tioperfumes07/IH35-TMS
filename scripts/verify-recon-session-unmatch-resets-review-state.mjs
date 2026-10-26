#!/usr/bin/env node
/**
 * ACC-20 ("No automatic un-categorize in either direction when a match is reversed").
 *
 * apps/backend/src/banking/reconciliation.routes.ts's session-scoped unmatch
 * (POST /api/v1/banking/reconciliation/:sessionId/unmatch) cleared all 6 matched_*_id pointers and
 * reversed the JE, but never touched review_state — leaving the row stuck at 'matched' with nothing
 * actually matched, an orphaned state that would not correctly re-surface in the "for review" queue.
 * recon-worklist.service.ts's own unmatchBankTransaction already got this right (its own comment
 * calls out the sibling route's gap by name). This guard proves the fix and stays true.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-recon-session-unmatch-resets-review-state";
const ROUTES_REL = "apps/backend/src/banking/reconciliation.routes.ts";
const WORKLIST_REL = "apps/backend/src/accounting/bank-recon/recon-worklist.service.ts";
const UNMATCH_REL = "apps/backend/src/accounting/bank-recon/unmatch-bank-transaction.service.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/**
 * Pure check over already-read source text, so --selftest can prove it with fixtures.
 * ROUND 288.2 item 2 (ONE unmatch writer) deleted the route's own inline UPDATE: the session route is now a
 * gate that delegates to recon-worklist's unmatchBankTransaction -> the ROUND 360 bank-line state machine
 * (undoBankLineOnClient) -> unmatchBankTransactionOnClient, whose single UPDATE clears the pointers. The
 * law is unchanged: the writer the route reaches must clear matched_journal_entry_id AND reset review_state
 * to 'for_review'; and the route must never regrow its own UPDATE that could skip that.
 * src = { routes, worklist, unmatch }.
 */
export function checkUnmatchResetsReviewState(src) {
  const failures = [];
  const source = src.routes;
  const routeStart = source.indexOf('"/api/v1/banking/reconciliation/:sessionId/unmatch"');
  if (routeStart < 0) {
    failures.push("could not locate the session-scoped unmatch route — source shape changed, guard needs updating");
    return failures;
  }
  const routeEnd = source.indexOf("app.post(", routeStart + 10);
  const routeBody = routeEnd > routeStart ? source.slice(routeStart, routeEnd) : source.slice(routeStart);
  if (!/await unmatchBankTransaction\(\{/.test(routeBody)) {
    failures.push(`${ROUTES_REL}: the session-scoped unmatch route no longer delegates to unmatchBankTransaction (the one unmatch writer)`);
  }
  if (/UPDATE\s+banking\.bank_transactions/.test(routeBody)) {
    failures.push(`${ROUTES_REL}: the session-scoped unmatch route writes banking.bank_transactions itself again — a second unmatch writer that can leave review_state stuck at 'matched'`);
  }
  const fnStart = src.worklist.indexOf("export async function unmatchBankTransaction(");
  const fnBody = fnStart < 0 ? "" : src.worklist.slice(fnStart, src.worklist.indexOf("\nexport ", fnStart + 10));
  if (!/undoBankLineOnClient\(client,/.test(fnBody)) {
    failures.push(`${WORKLIST_REL}: unmatchBankTransaction no longer goes through the bank-line state machine (undoBankLineOnClient)`);
  }
  // The writer is the UPDATE of banking.bank_transactions that clears matched_journal_entry_id. Comments are
  // stripped first (a prose "UPDATE...RETURNING" once captured the wrong span), and a block may not cross
  // into another UPDATE (LEAD 443.305 added a pointer-only pre-UPDATE that clears matched_related_party_loan_id
  // before the main writer runs — that pre-step is not the writer and must not be judged as one).
  const unmatchCode = src.unmatch.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/--[^\n]*/g, "");
  const blocks = [...unmatchCode.matchAll(/UPDATE banking\.bank_transactions\b(?:(?!\bUPDATE\b)[\s\S])*?\bRETURNING\b/g)].map((m) => m[0]);
  const writers = blocks.filter((b) => /matched_journal_entry_id\s*=\s*NULL/.test(b));
  const upd = writers.length ? writers : null;
  if (!upd) {
    failures.push(`${UNMATCH_REL}: the unmatch writer no longer clears matched_journal_entry_id — source shape changed, guard needs updating`);
  }
  if (!upd || !upd.every((b) => /review_state\s*=\s*'for_review'/.test(b))) {
    failures.push(`${UNMATCH_REL}: the unmatch writer clears every matched_*_id pointer but never resets review_state back to 'for_review' — the row is left stuck at 'matched' with nothing matched (an orphaned state that will not re-surface in the for-review queue)`);
  }
  return failures;
}

function runSelftest() {
  const good = {
    routes: `
app.post("/api/v1/banking/reconciliation/:sessionId/unmatch", {}, async (req, reply) => {
  await unmatchBankTransaction({ operating_company_id: o, bank_transaction_id: t, actor_user_uuid: u });
});
app.post("/api/v1/banking/reconciliation/other-route", {}, async () => {});
`,
    worklist: `export async function unmatchBankTransaction(input) {
  return withLuciaBypass(async (client) => { await undoBankLineOnClient(client, {}); });
}
export async function closeReconPeriod() {}
`,
    unmatch: `const res = await client.query(\`
      UPDATE banking.bank_transactions
      SET matched_journal_entry_id = NULL,
          review_state = 'for_review',
          updated_at = now()
      WHERE id = $1 RETURNING id\`);`,
  };
  if (checkUnmatchResetsReviewState(good).length !== 0) {
    throw new Error(`selftest: fully-fixed fixture must pass with zero failures — got ${JSON.stringify(checkUnmatchResetsReviewState(good))}`);
  }
  // Planted mutation: exactly the original bug — every matched_*_id cleared, review_state untouched.
  const broken = { ...good, unmatch: good.unmatch.replace("          review_state = 'for_review',\n", "") };
  if (!checkUnmatchResetsReviewState(broken).some((f) => f.includes("review_state"))) {
    throw new Error("selftest: removing the review_state reset must be flagged — it was not");
  }
  // Real shape (LEAD 443.305): a pointer-only pre-UPDATE and a prose comment naming UPDATE...RETURNING precede
  // the writer. The guard must still find and judge the real writer — passing here, and still failing below.
  const preStep = {
    ...good,
    unmatch:
      "await client.query(`UPDATE banking.bank_transactions SET matched_related_party_loan_id = NULL WHERE id = $1`);\n" +
      "// Postgres UPDATE...RETURNING reflects the NEW row\n" + good.unmatch,
  };
  if (checkUnmatchResetsReviewState(preStep).length !== 0) {
    throw new Error(`selftest: a pointer-only pre-UPDATE before the writer must not fail — got ${JSON.stringify(checkUnmatchResetsReviewState(preStep))}`);
  }
  const preStepBroken = { ...preStep, unmatch: preStep.unmatch.replace("          review_state = 'for_review',\n", "") };
  if (!checkUnmatchResetsReviewState(preStepBroken).some((f) => f.includes("review_state"))) {
    throw new Error("selftest: with the pre-UPDATE present, removing the review_state reset must still be flagged");
  }
  // Planted mutation: the route regrows its own inline UPDATE (the pre-288.2 second writer).
  const inline = { ...good, routes: good.routes.replace("await unmatchBankTransaction({", "await client.query(`UPDATE banking.bank_transactions SET matched_load_id = NULL`); ({") };
  if (checkUnmatchResetsReviewState(inline).length < 2) {
    throw new Error("selftest: an inline route UPDATE that bypasses unmatchBankTransaction must be flagged — it was not");
  }
  // Planted mutation: the worklist writer bypasses the state machine.
  const bypass = { ...good, worklist: good.worklist.replace("undoBankLineOnClient(client, {})", "noop()") };
  if (!checkUnmatchResetsReviewState(bypass).some((f) => f.includes("undoBankLineOnClient"))) {
    throw new Error("selftest: unmatchBankTransaction bypassing the state machine must be flagged — it was not");
  }
  console.log(`[${LABEL}] --selftest OK (fixed fixture passes; review_state never reset, an inline route UPDATE, and a state-machine bypass are each flagged)`);
}

if (process.argv.includes("--selftest")) {
  try {
    runSelftest();
  } catch (err) {
    console.error(String(err?.message ?? err));
    process.exit(1);
  }
  process.exit(0);
}

const failures = checkUnmatchResetsReviewState({ routes: read(ROUTES_REL), worklist: read(WORKLIST_REL), unmatch: read(UNMATCH_REL) });

if (failures.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} OK — session-scoped unmatch delegates to unmatchBankTransaction -> undoBankLineOnClient -> unmatchBankTransactionOnClient, which clears matched_journal_entry_id and resets review_state to 'for_review'`);
process.exit(0);
