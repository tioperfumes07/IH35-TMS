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

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Pure check over already-read source text, so --selftest can prove it with fixtures. */
export function checkUnmatchResetsReviewState(source) {
  const failures = [];
  const routeStart = source.indexOf('"/api/v1/banking/reconciliation/:sessionId/unmatch"');
  if (routeStart < 0) {
    failures.push("could not locate the session-scoped unmatch route — source shape changed, guard needs updating");
    return failures;
  }
  const routeEnd = source.indexOf("app.post(", routeStart + 10);
  const routeBody = routeEnd > routeStart ? source.slice(routeStart, routeEnd) : source.slice(routeStart);

  if (!/matched_journal_entry_id = NULL/.test(routeBody)) {
    failures.push("unmatch route no longer clears matched_journal_entry_id — source shape changed, guard needs updating");
  }
  if (!/review_state\s*=\s*'for_review'/.test(routeBody)) {
    failures.push("session-scoped unmatch clears every matched_*_id pointer but never resets review_state back to 'for_review' — the row is left stuck at 'matched' with nothing matched (an orphaned state that will not re-surface in the for-review queue)");
  }
  return failures;
}

function runSelftest() {
  const goodSource = `
app.post("/api/v1/banking/reconciliation/:sessionId/unmatch", {}, async (req, reply) => {
  const res = await client.query(\`
    UPDATE banking.bank_transactions bt
    SET
      matched_load_id = NULL,
      matched_journal_entry_id = NULL,
      review_state = 'for_review',
      updated_at = now()
  \`);
});
app.post("/api/v1/banking/reconciliation/other-route", {}, async () => {});
`;
  if (checkUnmatchResetsReviewState(goodSource).length !== 0) {
    throw new Error(`selftest: fully-fixed fixture must pass with zero failures — got ${JSON.stringify(checkUnmatchResetsReviewState(goodSource))}`);
  }

  // Planted mutation: exactly the original bug — every matched_*_id cleared, review_state untouched.
  const broken = goodSource.replace("      review_state = 'for_review',\n", "");
  const brokenFailures = checkUnmatchResetsReviewState(broken);
  if (!brokenFailures.some((f) => f.includes("review_state"))) {
    throw new Error("selftest: removing the review_state reset must be flagged — it was not");
  }

  console.log(`[${LABEL}] --selftest OK (fixed fixture passes; the original pre-fix shape — review_state never reset — is correctly flagged)`);
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

const source = read(ROUTES_REL);
const failures = checkUnmatchResetsReviewState(source);

if (failures.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} OK — session-scoped unmatch resets review_state to 'for_review', matching recon-worklist.service.ts's unmatchBankTransaction`);
process.exit(0);
