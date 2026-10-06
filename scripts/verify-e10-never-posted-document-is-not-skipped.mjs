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

/** Checks the runner source text. Exported so the selftest can run it on planted variants. */
export function shapeFailures(src) {
  const fails = [];
  // ROUND 128 (owner): "status does not matter ... VOID THEM" -- draft/proforma are IN scope. Each family needs a
  // candidate query for documents with zero postings, stamped directly, never routed through a reversal engine.
  for (const [family, variable, sourceType] of [
    ["invoice", "noGlInvoices", "invoice"],
    ["expense", "noGlExpenses", "expense"],
  ]) {
    const m = src.match(new RegExp(`const ${variable} = await client\\.query[\\s\\S]*?\\n  \\}\\n`));
    if (!m) {
      fails.push(`no never-posted ${family} phase found (expected \`const ${variable} = await client.query\` and its loop).`);
      continue;
    }
    const block = m[0];
    if (!new RegExp(`NOT EXISTS[\\s\\S]{0,200}journal_entry_postings[\\s\\S]{0,200}source_transaction_type = '${sourceType}'`).test(block)) {
      fails.push(`the ${variable} query does not select ${family}s with zero journal_entry_postings rows.`);
    }
    if (/status NOT IN \(\s*'draft'/i.test(block)) {
      fails.push(`the ${variable} query excludes draft/proforma -- ROUND 128 put them in scope; they would be skipped forever.`);
    }
    if (!new RegExp(`stamp\\(\\w+Tally, "${family}"`).test(block)) {
      fails.push(`the ${variable} loop does not stamp the ${family} voided.`);
    }
    if (/reversePostedSourceTransaction|reverseJournalEntryNoFlip|reverseFactoringAdvanceEvent|reverseByJeIdFallback/.test(block)) {
      fails.push(`the ${variable} loop calls a reversal engine -- a document with no GL is stamp-only (never post-then-void).`);
    }
  }
  return fails;
}

export function assertNeverPostedPredicateShape(runnerPath = RUNNER_PATH) {
  if (!fs.existsSync(runnerPath)) return [`runner not found at ${path.relative(ROOT, runnerPath)}`];
  return shapeFailures(fs.readFileSync(runnerPath, "utf8"));
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
         WHERE i.operating_company_id = $1::uuid AND i.voided_at IS NULL AND i.status <> 'void'
           AND NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings jep WHERE jep.source_transaction_type = 'invoice' AND jep.source_transaction_id = i.id::text)
      `,
      [USMCA_COMPANY_ID]
    );
    const expRes = await client.query(
      `
        SELECT count(*)::text AS n FROM accounting.expenses ex
         WHERE ex.operating_company_id = $1::uuid AND ex.voided_at IS NULL AND ex.status <> 'void'
           AND NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings jep WHERE jep.source_transaction_type = 'expense' AND jep.source_transaction_id = ex.id::text)
      `,
      [USMCA_COMPANY_ID]
    );
    await client.query("COMMIT");
    console.log(`${LABEL}: live -- never-posted invoices: ${invRes.rows[0].n}, never-posted expenses: ${expRes.rows[0].n} (any status; the runner stamps them void)`);
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
    const real = fs.readFileSync(RUNNER_PATH, "utf8");
    const base = shapeFailures(real);
    const plants = [
      ["expense phase removed (the LST-F427 gap)", real.replace(/const noGlExpenses = /, "const skippedExpenses = ")],
      ["invoice phase removed", real.replace(/const noGlInvoices = /, "const skippedInvoices = ")],
      ["draft/proforma excluded again", real.replace("AND i.voided_at IS NULL AND i.status <> 'void'", "AND i.voided_at IS NULL AND i.status NOT IN ('draft', 'proforma')")],
      ["expense query drops the zero-postings check", real.replace(/(const noGlExpenses[\s\S]*?)NOT EXISTS/, "$1EXISTS")],
      ["expense loop routed through a reversal engine", real.replace('await stamp(expenseTally, "expense", ex.id);\n      });\n      expenseTally.reversed++; // no GL', 'await reverseByJeIdFallback("expense", ex.id, VOID_REASON, "expense", expenseTally);\n      });\n      expenseTally.reversed++; // no GL')],
    ];
    const missed = [];
    for (const [name, planted] of plants) {
      if (planted === real) missed.push(`${name} (plant did not change the source)`);
      else if (shapeFailures(planted).length === 0) missed.push(name);
    }
    if (base.length || missed.length) {
      console.error(`${LABEL} --selftest FAIL`);
      for (const f of base) console.error(`  real runner: ${f}`);
      for (const m of missed) console.error(`  not caught: ${m}`);
      process.exitCode = 1;
      return;
    }
    console.log(`${LABEL} --selftest PASS -- real runner clean; ${plants.length}/${plants.length} plants caught`);
    return;
  }

  const fails = assertNeverPostedPredicateShape();
  if (fails.length > 0) {
    console.error(`${LABEL}: FAIL -- ${fails.length} problem(s):`);
    for (const f of fails) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`${LABEL}: OK -- the runner stamps never-posted invoices and expenses (zero journal_entry_postings, any status -- ROUND 128) directly, never via a reversal engine.`);
  }
  await liveCheck();
}

await main();
