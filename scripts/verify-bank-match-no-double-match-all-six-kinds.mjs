#!/usr/bin/env node
/**
 * MATCHED-STATE GUARD — BANK-F4 (BANKING-MATCH-FLOW-AUDIT Q4/F4).
 *
 * fetchLedgerCandidates in match.service.ts sources candidates from 6 kinds: payment,
 * bill_payment, transfer, je, bill, expense. Originally only 2 of the 6 (bill, expense) excluded
 * an already-matched document from being offered again — the other 4 had no protection, meaning
 * the SAME document could be matched to a SECOND bank transaction with nothing stopping it except
 * UI convention. Dormant on USMCA today (0 rows in every source table) but live risk the moment
 * the owner creates the first real expense/bill/payment.
 *
 * This guard asserts every one of the 6 kinds carries a NOT EXISTS ... banking.reconciliation_matches
 * guard, scoped to its own ledger_entry_kind literal (so a copy-paste bug that reuses e.g. 'bill'
 * for the 'expense' branch is caught, not just "a NOT EXISTS exists somewhere").
 *
 * NOTE — this is the APP-LEVEL half of the fix. It has an inherent TOCTOU race: two concurrent
 * confirms racing the same document can both pass this NOT EXISTS check before either writes its
 * row. The STRUCTURAL guarantee (a partial UNIQUE index on
 * banking.reconciliation_matches(operating_company_id, ledger_entry_kind, ledger_entry_id) WHERE
 * match_state IN ('auto_matched','user_matched')) requires a migration — routed to CC-1 in
 * GUARD-WORKORDERS.md (CC-2's chrome-only lane is hard-barred from authoring migrations). This
 * guard closes the gap CI can close without one; the DB-level close is tracked separately.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-match-no-double-match-all-six-kinds";
const SERVICE_REL = "apps/backend/src/accounting/bank-recon/match.service.ts";

const KINDS = ["payment", "bill_payment", "transfer", "je", "bill", "expense"];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Pure check over already-read source text, so --selftest can prove it with fixtures. */
export function checkAllSixKindsGuarded(source) {
  const failures = [];
  const fnStart = source.indexOf("async function fetchLedgerCandidates");
  if (fnStart < 0) {
    failures.push("could not locate fetchLedgerCandidates in match.service.ts — guard needs updating");
    return failures;
  }
  const fnEnd = source.indexOf("\nasync function", fnStart + 10);
  const fnBody = fnEnd > fnStart ? source.slice(fnStart, fnEnd) : source.slice(fnStart);

  // ROUND 365.6: the WRITE-point refusal in storeMatch covers all six kinds (accept takes transfer / je ids from routes
  // with no candidate step). Required unconditionally.
  const store = source.slice(source.indexOf("async function storeMatch("), source.indexOf("INSERT INTO banking.reconciliation_matches", source.indexOf("async function storeMatch(")));
  if (!/AND m\.ledger_entry_kind = \$2::text\s*AND m\.ledger_entry_id = \$3::uuid\s*AND m\.bank_transaction_id <> \$4::uuid\s*AND m\.voided_at IS NULL\s*AND m\.match_state IN \('auto_matched', 'user_matched'\)/.test(store)
      || !/throw new Error\(`document_already_matched:/.test(store)) {
    failures.push("storeMatch must refuse a document already held by a live match on another bank line (all six kinds) — the write-point half of BANK-F4");
  }
  // The candidate half: every kind fetchLedgerCandidates actually queries must exclude already-matched documents.
  // A kind with no candidate branch cannot be offered twice (ROUND 157-C removed transfer / je); bill is re-offered on
  // purpose until its open balance is zero (ROUND 155.25) and is not a persistable match kind.
  for (const kind of KINDS.filter((k) => new RegExp(`wants\\("${k}"\\)`).test(fnBody) && k !== "bill")) {
    // Each kind's own NOT EXISTS block must reference its OWN ledger_entry_kind literal — a regex
    // that just checked "NOT EXISTS appears somewhere AND 'payment' appears somewhere" would pass
    // even if the guard were only wired for one kind and copy-pasted with the wrong literal.
    const re = new RegExp(
      `NOT EXISTS \\(\\s*SELECT 1 FROM banking\\.reconciliation_matches m\\s*WHERE m\\.ledger_entry_kind = '${kind}'\\s*AND m\\.ledger_entry_id = \\w+\\.id\\s*AND m\\.match_state IN \\('auto_matched', 'user_matched'\\)`
    );
    if (!re.test(fnBody)) {
      failures.push(`ledger_entry_kind '${kind}' has no NOT EXISTS already-matched guard in fetchLedgerCandidates — a document of this kind can be matched to two bank transactions`);
    }
  }
  return failures;
}

function runSelftest() {
  // ROUND 365.6: plants on the REAL file (the old synthetic fixtures modelled neither the wants() branches nor storeMatch).
  const real = read(SERVICE_REL);
  const fails = [];
  if (checkAllSixKindsGuarded(real).length) fails.push(`real tree not clean: ${checkAllSixKindsGuarded(real).join("; ")}`);
  const plants = [
    ["write-point refusal removed", real.replace("throw new Error(`document_already_matched:", "console.warn(`document_already_matched:")],
    ["expense branch exclusion removed", real.replace(/WHERE m\.ledger_entry_kind = 'expense'/, "WHERE m.ledger_entry_kind = 'nothing'")],
    ["payment branch uses the wrong literal", real.replace(/WHERE m\.ledger_entry_kind = 'payment'/, "WHERE m.ledger_entry_kind = 'bill_payment'")],
  ];
  for (const [name, planted] of plants) {
    if (planted === real) fails.push(`plant did not change the source: ${name}`);
    else if (checkAllSixKindsGuarded(planted).length === 0) fails.push(`plant escaped: ${name}`);
  }
  if (fails.length) {
    console.error(`selftest: ${fails.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
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

const source = read(SERVICE_REL);
const failures = checkAllSixKindsGuarded(source);

if (failures.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} OK — all 6 ledger_entry_kind sources (payment, bill_payment, transfer, je, bill, expense) exclude an already-matched document`);
process.exit(0);
