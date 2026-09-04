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

  for (const kind of KINDS) {
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
  const oneKind = (kind, alias) => `
    const ${kind}s = await client.query(\`
      SELECT id::text
      FROM accounting.${kind}s ${alias}
      WHERE operating_company_id = $1::uuid
        AND NOT EXISTS (
          SELECT 1 FROM banking.reconciliation_matches m
          WHERE m.ledger_entry_kind = '${kind}'
            AND m.ledger_entry_id = ${alias}.id
            AND m.match_state IN ('auto_matched', 'user_matched')
        )
      LIMIT $2
    \`, [operatingCompanyId, rowLimit]);`;

  const goodSource = `
async function fetchLedgerCandidates(client, operatingCompanyId, txnDate, isCredit, bankAccountId, options = {}) {
  ${oneKind("payment", "p")}
  ${oneKind("bill_payment", "bp")}
  ${oneKind("transfer", "t")}
  ${oneKind("je", "je")}
  ${oneKind("bill", "b")}
  ${oneKind("expense", "e")}
}
async function acceptMatchWithResolveDifference() {}
`;
  const goodFailures = checkAllSixKindsGuarded(goodSource);
  if (goodFailures.length !== 0) {
    throw new Error(`selftest: fully-guarded fixture must pass with zero failures — got ${JSON.stringify(goodFailures)}`);
  }

  // Planted mutation: exactly the original bug — 4 of 6 kinds have no guard (only bill/expense did,
  // pre-BANK-F4). Must be flagged for each unguarded kind, not just one.
  const droppedFour = `
async function fetchLedgerCandidates(client, operatingCompanyId, txnDate, isCredit, bankAccountId, options = {}) {
  const payments = await client.query(\`SELECT id::text FROM accounting.payments p WHERE operating_company_id = $1::uuid LIMIT $2\`, [operatingCompanyId, rowLimit]);
  const billPayments = await client.query(\`SELECT id::text FROM accounting.bill_payments bp WHERE operating_company_id = $1::uuid LIMIT $2\`, [operatingCompanyId, rowLimit]);
  const transfers = await client.query(\`SELECT id::text FROM accounting.transfers t WHERE operating_company_id = $1::uuid LIMIT $2\`, [operatingCompanyId, rowLimit]);
  const jes = await client.query(\`SELECT id::text FROM accounting.jes je WHERE operating_company_id = $1::uuid LIMIT $2\`, [operatingCompanyId, rowLimit]);
  ${oneKind("bill", "b")}
  ${oneKind("expense", "e")}
}
async function acceptMatchWithResolveDifference() {}
`;
  const droppedFailures = checkAllSixKindsGuarded(droppedFour);
  for (const kind of ["payment", "bill_payment", "transfer", "je"]) {
    if (!droppedFailures.some((f) => f.includes(`'${kind}'`))) {
      throw new Error(`selftest: dropping the guard for '${kind}' must be flagged — it was not (got ${JSON.stringify(droppedFailures)})`);
    }
  }
  if (droppedFailures.some((f) => f.includes("'bill'") || f.includes("'expense'"))) {
    throw new Error("selftest: bill/expense still have their guard in this fixture and must NOT be flagged");
  }

  console.log(`[${LABEL}] --selftest OK (fully-guarded fixture passes; dropping 4 of 6 kinds — the original pre-fix shape — correctly flags exactly those 4)`);
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
