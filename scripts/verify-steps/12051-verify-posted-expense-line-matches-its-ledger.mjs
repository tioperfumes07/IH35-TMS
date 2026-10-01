#!/usr/bin/env node
// CC-2, fuel cost posting chain. A posted expense line's account must be the account its journal-entry leg
// posted. 2026-10-01: 3 of 544 USMCA lines disagreed ($518.80 of reefer diesel on 5010 DEF, the line recoded
// to 5000 after posting); reissued under AUTH-189. Migration 202615170700 refuses that edit at the database.
//
// static: the trigger exists in its migration, scoped to the money columns only. live (read-only): 0 posted
// lines whose debit leg sits on another account; the trigger is installed once the migration has run.
import pg from "pg";
import { readFileSync } from "node:fs";

const LABEL = "verify-posted-expense-line-matches-its-ledger";
const ROOT = new URL("../../", import.meta.url);

function selftest() {
  const mig = readFileSync(new URL("db/migrations/202615170700_expense_posted_line_money_fields_immutable.sql", ROOT), "utf8");
  const problems = [];
  if (!/BEFORE UPDATE OF expense_account_uuid, amount_cents, amount ON accounting\.expense_lines/.test(mig)) problems.push("trigger must fire on the money columns only");
  if (!/je\.voided_at IS NULL\s+AND je\.reversed_by_je_id IS NULL/.test(mig)) problems.push("trigger must apply only under a live journal entry");
  if (problems.length) {
    console.error(`${LABEL} --selftest FAIL — ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (2/2)`);
}

selftest();
if (process.argv.includes("--selftest")) process.exit(0);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`${LABEL}: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP.`);
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN");
  const hasOwner = (await client.query(`SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner'`)).rows.length > 0;
  if (hasOwner) await client.query("SET LOCAL ROLE neondb_owner");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const r = (await client.query(`
    WITH pl AS (
      SELECT e.operating_company_id, e.expense_number, l.amount_cents, l.expense_account_uuid,
             (SELECT p.account_id FROM accounting.journal_entry_postings p
               WHERE p.journal_entry_uuid = e.journal_entry_id AND p.source_transaction_line_id::text = l.id::text
                 AND p.debit_or_credit = 'debit' LIMIT 1) AS leg_account
        FROM accounting.expenses e
        JOIN accounting.expense_lines l ON l.expense_id = e.id
        JOIN accounting.journal_entries j ON j.id = e.journal_entry_id
       WHERE e.voided_at IS NULL AND j.voided_at IS NULL AND j.reversed_by_je_id IS NULL)
    SELECT count(*)::int AS lines,
           count(*) FILTER (WHERE leg_account IS NOT NULL)::int AS compared,
           count(*) FILTER (WHERE leg_account IS NOT NULL AND leg_account <> expense_account_uuid)::int AS mismatched,
           coalesce(json_agg(expense_number) FILTER (WHERE leg_account IS NOT NULL AND leg_account <> expense_account_uuid), '[]') AS docs
      FROM pl`)).rows[0];
  const trig = (await client.query(`SELECT 1 FROM pg_trigger WHERE tgname = 'trg_expense_lines_posted_money_immutable'`)).rows.length > 0;
  await client.query("ROLLBACK");
  if (r.mismatched > 0) {
    console.error(`${LABEL}: FAIL — ${r.mismatched} posted line(s) sit on another account in the ledger: ${JSON.stringify(r.docs).slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`${LABEL}: LIVE PASS — ${r.compared} of ${r.lines} posted lines compared to their ledger leg (positive control), 0 disagree; trigger ${trig ? "installed" : "not on this database yet (lands with the next deploy)"}.`);
} finally {
  await client.end();
}
