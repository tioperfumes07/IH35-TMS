#!/usr/bin/env node
/**
 * GUARD-E10-NEVER-POSTED-DOCUMENT-IS-NOT-SKIPPED (Round 125)
 *
 * The E10 runner's candidate queries (scripts/ops/e10-void-runner-01-usmca.ts) originally found
 * only documents with a LIVE posting to reverse -- a document with ZERO postings ever has nothing
 * to reverse, so "ledger confirmed dead" could never be satisfied and it was skipped forever,
 * invisible to both the poster and the purger. Live-measured: INV-2026-00010 ($5,210.00, load
 * 13579), status='sent', zero journal_entry_postings rows -- one document alone holding BOTH
 * ledger.ar_tieout and ledger.posted_without_posting red.
 *
 * This guard checks the runner's own CODE SHAPE for the fix (a never-posted candidate query per
 * family, gated to exclude draft/proforma, calling stampDocumentVoided directly with a
 * void_reason naming the zero-ledger condition -- never a reversal engine call, never GL math)
 * red-before-green: fails on a version missing the fix, passes on the real file.
 *
 * QUERIES LIVE, DOES NOT TRUST THE RUNNER'S SELF-REPORT: with DATABASE_URL set, also directly
 * counts live USMCA documents that are (a) not voided, (b) not draft/proforma, and (c) carry
 * ZERO journal_entry_postings rows ever -- the exact shape the fix must catch. This number can be
 * nonzero on a legitimate re-run (a fresh never-posted document can appear at any time); it is
 * reported, not failed on, UNLESS the code-shape check above also fails, in which case a nonzero
 * live count PLUS a missing predicate is the red-before-green failure this guard exists to catch.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// verify-no-silent-db-skip (03d): this guard's REAL, load-bearing check is the static code-shape
// assertion above -- it needs no DB and always runs, always fails closed on a missing predicate.
// The live count in liveCheck() below is a supplementary diagnostic (reports what CAN'T be a
// pass/fail on its own -- a nonzero never-posted count is expected and legitimate on a live
// system between runs), not a money verdict this guard is making. Declaring offline-skip honestly
// rather than manufacturing a live check the guard's actual verdict does not depend on.
export const ALLOW_OFFLINE_SKIP = "core check is static code-shape (always runs); the live count is a reported diagnostic, not this guard's pass/fail verdict";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-e10-never-posted-document-is-not-skipped";
const RUNNER_PATH = path.join(ROOT, "scripts/ops/e10-void-runner-01-usmca.ts");
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

export function assertNeverPostedPredicateShape(runnerPath = RUNNER_PATH) {
  const fails = [];
  if (!fs.existsSync(runnerPath)) {
    fails.push(`runner not found at ${path.relative(ROOT, runnerPath)}`);
    return fails;
  }
  const src = fs.readFileSync(runnerPath, "utf8");

  if (!/never posted|neverPosted/i.test(src)) {
    fails.push("no 'never posted' candidate handling found at all -- the predicate gap is unaddressed.");
    return fails;
  }

  // For invoice: the never-posted query must exclude draft/proforma AND must NOT call a
  // reversal engine (reversePostedSourceTransaction / reverseJournalEntryNoFlip) anywhere near
  // its own stampDocumentVoided call -- it must go straight to the stamp.
  const invoiceBlockMatch = src.match(/neverPostedInvoices[\s\S]{0,2500}/);
  if (!invoiceBlockMatch) {
    fails.push("no never-posted invoice candidate query found (expected a neverPostedInvoices variable).");
  } else {
    const block = invoiceBlockMatch[0];
    if (!/status NOT IN \('draft', 'proforma'\)|status NOT IN\('draft','proforma'\)/i.test(block.replace(/\s+/g, " "))) {
      fails.push("never-posted invoice query does not visibly exclude draft/proforma status.");
    }
    if (!/NOT EXISTS[\s\S]{0,200}journal_entry_postings/i.test(block)) {
      fails.push("never-posted invoice query does not check for zero journal_entry_postings rows.");
    }
    if (!/stampDocumentVoided/.test(block)) {
      fails.push("never-posted invoice block does not call stampDocumentVoided.");
    }
    if (/reversePostedSourceTransaction|reverseJournalEntryNoFlip|reverseFactoringAdvanceEvent/.test(block)) {
      fails.push("never-posted invoice block appears to call a reversal engine -- this must be a stamp-only path (owner's ruling: never post-then-void to turn a check green).");
    }
  }

  const expenseBlockMatch = src.match(/neverPostedExpenses[\s\S]{0,2000}/);
  if (!expenseBlockMatch) {
    fails.push("no never-posted expense candidate query found (expected a neverPostedExpenses variable).");
  } else {
    const block = expenseBlockMatch[0];
    if (!/NOT EXISTS[\s\S]{0,200}journal_entry_postings/i.test(block)) {
      fails.push("never-posted expense query does not check for zero journal_entry_postings rows.");
    }
    if (!/stampDocumentVoided/.test(block)) {
      fails.push("never-posted expense block does not call stampDocumentVoided.");
    }
    if (/reversePostedSourceTransaction|reverseJournalEntryNoFlip|reverseFactoringAdvanceEvent/.test(block)) {
      fails.push("never-posted expense block appears to call a reversal engine -- must be stamp-only.");
    }
  }

  // The draft/proforma documents must be NAMED (logged), never voided.
  if (!/NAMED, NOT VOIDED/i.test(src)) {
    fails.push("draft/proforma documents are not visibly named-and-not-voided anywhere in the file.");
  }

  return fails;
}

async function liveCheck() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(`${LABEL}: DATABASE_URL not set -- skipping the live count (code-shape check still ran above).`);
    return;
  }
  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const invRes = await client.query(
      `
        SELECT count(*)::text AS n FROM accounting.invoices i
         WHERE i.operating_company_id = $1::uuid AND i.voided_at IS NULL AND i.status NOT IN ('draft', 'proforma')
           AND NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings jep WHERE jep.source_transaction_type = 'invoice' AND jep.source_transaction_id = i.id::text)
      `,
      [USMCA_COMPANY_ID]
    );
    const expRes = await client.query(
      `
        SELECT count(*)::text AS n FROM accounting.expenses ex
         WHERE ex.operating_company_id = $1::uuid AND ex.voided_at IS NULL AND ex.status <> 'draft'
           AND NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings jep WHERE jep.source_transaction_type = 'expense' AND jep.source_transaction_id = ex.id::text)
      `,
      [USMCA_COMPANY_ID]
    );
    await client.query("COMMIT");
    console.log(`${LABEL}: live -- never-posted invoices (not draft/proforma): ${invRes.rows[0].n}, never-posted expenses (not draft): ${expRes.rows[0].n}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.log(`${LABEL}: live check query error: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const selftest = process.argv.includes("--selftest");
  if (selftest) {
    const fakeMissing = path.join(ROOT, "scripts/verify-e10-never-posted-document-is-not-skipped.mjs");
    const failsOnSelf = assertNeverPostedPredicateShape(fakeMissing);
    const pass1 = failsOnSelf.length > 0;
    const failsReal = assertNeverPostedPredicateShape(RUNNER_PATH);
    const pass2 = failsReal.length === 0;
    console.log(`${LABEL} --selftest: red-before-green file fails closed: ${pass1 ? "PASS" : "FAIL"}; real runner passes clean: ${pass2 ? "PASS" : "FAIL"}`);
    if (!pass2) for (const f of failsReal) console.log(`  ${f}`);
    process.exitCode = pass1 && pass2 ? 0 : 1;
    return;
  }

  const fails = assertNeverPostedPredicateShape();
  if (fails.length > 0) {
    console.error(`${LABEL}: FAIL -- ${fails.length} problem(s):`);
    for (const f of fails) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`${LABEL}: OK -- the runner stamps never-posted documents (zero journal_entry_postings, not draft/proforma) directly, never via a reversal engine; draft/proforma are named, not voided.`);
  }
  await liveCheck();
}

await main();
