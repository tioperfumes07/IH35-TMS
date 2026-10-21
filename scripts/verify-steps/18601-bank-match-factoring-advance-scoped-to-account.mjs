/**
 * 18601 — verify-bank-match-factoring-advance-scoped-to-account
 * CC-1 · 443.M1 completion
 *
 * fetchLedgerCandidates() must scope the factoring_advance branch to the
 * specific bank account being reconciled, the way every other PERSISTABLE
 * branch does.  Two checks:
 *
 *   CHECK 1 — parameter rename: the function signature must declare
 *             `bankAccountId` (no leading underscore).  The underscore is
 *             TypeScript's signal for "intentionally unused"; the parameter
 *             IS used (register lookup, every branch predicate), so the
 *             underscore is a lie that masks future regressions.
 *
 *   CHECK 2 — factoring_advance scoped: the SQL params array for the
 *             factoring_advance CTE must include `ledgerId`, which is the
 *             GL ledger account for this bank account.  Without it, a Faro
 *             wire received by account A appears as a candidate on account
 *             B whenever both are operating banks.
 *
 * RED on the pre-fix tree (parameter still `_bankAccountId`; factoring
 * params = [operatingCompanyId, fromDate, toDate, likeParam, rowLimit]).
 * GREEN after the fix (renamed + ledgerId in params).
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const file = path.join(root, "apps/backend/src/accounting/bank-recon/match.service.ts");
const src = readFileSync(file, "utf8");

let fail = false;

// ── CHECK 1: parameter is named bankAccountId (no underscore) ────────────────
const sigRe = /async function fetchLedgerCandidates\b[\s\S]*?(?=\{)/;
const sigMatch = src.match(sigRe);
if (!sigMatch) {
  console.error("FAIL C1: fetchLedgerCandidates function signature not found");
  process.exit(1);
}
if (sigMatch[0].includes("_bankAccountId")) {
  console.error(
    "FAIL C1: fetchLedgerCandidates parameter is still `_bankAccountId` (underscore signals unused but it IS used).\n" +
    "         Rename to `bankAccountId` — every branch that omits it is an invisible M1 regression risk."
  );
  fail = true;
} else {
  console.log("PASS C1: parameter is bankAccountId (no underscore)");
}

// ── CHECK 2: factoring_advance branch passes ledgerId to its query ────────────
const faroIdx = src.indexOf('wants("factoring_advance")');
if (faroIdx === -1) {
  console.error("FAIL C2: factoring_advance branch not found in fetchLedgerCandidates");
  process.exit(1);
}
// Extract a window large enough to contain the params array for this branch.
// The window ends at the next wants() guard or at the closing of the isCredit block.
const window = src.slice(faroIdx, faroIdx + 3500);
const paramsRe = /\[\s*operatingCompanyId\s*,\s*fromDate\s*,\s*toDate\s*,\s*likeParam\s*,\s*rowLimit([^\]]*)\]/;
const paramsMatch = window.match(paramsRe);
if (!paramsMatch) {
  console.error("FAIL C2: expected params array not found in factoring_advance branch");
  fail = true;
} else if (!paramsMatch[1].includes("ledgerId")) {
  console.error(
    "FAIL C2: factoring_advance SQL params do not include `ledgerId`.\n" +
    `         Found params tail: "${paramsMatch[1].trim()}"\n` +
    "         A Faro wire shows as a candidate on every operating-bank register — not just the one it funded.\n" +
    "         Fix: add EXISTS (SELECT 1 FROM accounting.journal_entry_postings jp\n" +
    "                           WHERE jp.journal_entry_uuid = fp.journal_entry_id\n" +
    "                             AND jp.account_id = $6::uuid  -- ledgerId\n" +
    "                             AND jp.debit_or_credit = 'debit'\n" +
    "                             AND jp.reversal_of_line_id IS NULL)\n" +
    "         and pass ledgerId as the 6th parameter."
  );
  fail = true;
} else {
  console.log("PASS C2: factoring_advance branch passes ledgerId — scoped to this account's GL ledger");
}

if (fail) process.exit(1);
console.log("ALL PASS — M1 complete: factoring_advance scoped to bank account via ledgerId");
process.exit(0);
