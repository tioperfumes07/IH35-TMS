#!/usr/bin/env node
// GUARD — verify-void-live-posting-db-constraint.mjs (DEFECT 282.1, 2026-09-30)
//
// Enforces that migration 202614610000's CONSTRAINT TRIGGER
// (accounting.fn_block_void_with_live_postings, applied per-table as
// trg_block_void_with_live_postings) exists and is enabled on every table this defect names. A
// missing or disabled trigger on ANY of the 6 tables silently re-opens the exact hole 282.1 closed
// (a raw UPDATE setting voided_at while a live posting still references the row) — this is checked
// live, never assumed from the migration file existing on disk.
export const REQUIRES_LIVE_DB =
  "pg_trigger + pg_proc — must fail-closed, never skip; a missing/disabled trigger is a real regression, not a measurement gap";

import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-void-live-posting-db-constraint";

// Table -> expected TG_ARGV[0] (the journal_entry_postings.source_transaction_type this table's
// trigger checks against). Confirmed live before the migration was written — see the migration's
// own header comment for the "not the table name" gotchas (fuel_event, customer_payment).
const EXPECTED_TABLES = [
  { schema: "accounting", table: "expenses", sourceType: "expense" },
  { schema: "accounting", table: "invoices", sourceType: "invoice" },
  { schema: "accounting", table: "bills", sourceType: "bill" },
  { schema: "accounting", table: "payments", sourceType: "customer_payment" },
  { schema: "accounting", table: "factoring_advances", sourceType: "factoring_advance" },
  { schema: "fuel", table: "fuel_transactions", sourceType: "fuel_event" },
];

async function measureLive(client) {
  await client.query("BEGIN");
  const problems = [];

  const fnRes = await client.query(
    `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'accounting' AND p.proname = 'fn_block_void_with_live_postings'`
  );
  if (fnRes.rows.length === 0) {
    problems.push("accounting.fn_block_void_with_live_postings() does not exist.");
  }

  for (const t of EXPECTED_TABLES) {
    const res = await client.query(
      `SELECT tg.tgenabled, tg.tgdeferrable, tg.tginitdeferred, pg_get_triggerdef(tg.oid) AS def
         FROM pg_trigger tg
         JOIN pg_class c ON c.oid = tg.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = $2 AND tg.tgname = 'trg_block_void_with_live_postings'
          AND NOT tg.tgisinternal`,
      [t.schema, t.table]
    );
    const row = res.rows[0];
    if (!row) {
      problems.push(`${t.schema}.${t.table}: trg_block_void_with_live_postings is MISSING.`);
      continue;
    }
    if (row.tgenabled === "D") {
      problems.push(`${t.schema}.${t.table}: trg_block_void_with_live_postings exists but is DISABLED.`);
    }
    if (!row.tgdeferrable || !row.tginitdeferred) {
      problems.push(`${t.schema}.${t.table}: trigger is not DEFERRABLE INITIALLY DEFERRED (must check at commit, not per-statement, or the correct reverse-then-void pattern in one transaction breaks).`);
    }
    if (!row.def || !row.def.includes(`'${t.sourceType}'`)) {
      problems.push(`${t.schema}.${t.table}: trigger's own source_transaction_type argument does not match the expected '${t.sourceType}' (def: ${row.def}).`);
    }
  }

  await client.query("ROLLBACK");
  return problems;
}

async function main() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    const problems = await measureLive(client);
    if (problems.length > 0) {
      console.error(`${LABEL}: FAIL — ${problems.length} problem(s):\n` + problems.map((p) => `  - ${p}`).join("\n"));
      process.exitCode = 1;
      return;
    }
    console.log(`${LABEL}: OK — accounting.fn_block_void_with_live_postings() exists; all ${EXPECTED_TABLES.length} tables carry an enabled, correctly-configured, deferred constraint trigger.`);
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
