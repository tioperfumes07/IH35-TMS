#!/usr/bin/env tsx
// ROUND 443 E4 (CC-2, 2026-11-03) — LEAD directive 2026-11-03 13:28 CT:
// "E4 closure — uncategorize the 3 categorized stale Zelle pendings
//  (−4,000.00 10-07, +3,500.00 10-08, −500.00 10-11)
//  through the uncategorize/unmatch path, sweep → stale >7d = 0"
//
// All 3 are status='categorized', review_bucket='categorized', resolution_kind='added',
// pending=true (Plaid stale), each with a matched_journal_entry_id (status='posted').
//
// Uses the REAL undo engine (undoBankLineOnClient) — same atomic path as
// POST /api/v1/banking/transactions/:id/undo-categorization, called directly with
// a plain pg client (established pattern: scripts/ops/2026-09-13-cc2-absorption-b1-diesel-expense-dedupe.ts).
// MONEY_CONTROL_VOID_REVERSAL_ENABLED = override_enabled=true for USMCA (verified live 2026-11-03).
// POSTING_ENGINE_SUPPORTS_REPOST = true (apps/backend/src/accounting/posting-engine.service.ts:124).
//
// Pass --apply to execute; dry-run by default.
import pg from "pg";
import { undoBankLineOnClient } from "../../apps/backend/src/banking/bank-line-state-machine.service.js";

const APPLY = process.argv.includes("--apply");
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const TARGET_BANK_TX_IDS = [
  "b5a068d2-8b83-43fd-be35-160749ef0afd", // −4,000.00 2026-10-07 Laura Munoz
  "1895f94d-7a3a-49f4-b5c9-6bf181730ecf", // +3,500.00 2026-10-08 Laura Munoz
  "23a3df57-5e8b-4f93-90ff-848b2a42a611", // −500.00   2026-10-11 Marco Olvera
];

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

  // PRE-FLIGHT
  {
    const c = await pool.connect();
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    const ownerRow = await c.query(
      `SELECT role FROM identity.users WHERE id = $1::uuid`,
      [OWNER_USER_ID]
    );
    const rows = await c.query(
      `SELECT id::text, status, review_bucket, resolution_kind,
              matched_journal_entry_id::text,
              amount_cents, transaction_date::date,
              pending
         FROM banking.bank_transactions
        WHERE id = ANY($1::uuid[])
          AND operating_company_id = $2::uuid
        ORDER BY transaction_date`,
      [TARGET_BANK_TX_IDS, USMCA_COMPANY_ID]
    );
    const flagRow = await c.query(
      `SELECT enabled FROM lib.feature_flag_overrides
        WHERE flag_key = 'MONEY_CONTROL_VOID_REVERSAL_ENABLED'
          AND operating_company_id = $1::uuid`,
      [USMCA_COMPANY_ID]
    );
    const staleCount = await c.query(
      `SELECT count(*)::int AS n
         FROM banking.bank_transactions
        WHERE operating_company_id = $1::uuid
          AND pending = true
          AND status NOT IN ('uncategorized','pending_categorization')
          AND transaction_date < now() - interval '7 days'`,
      [USMCA_COMPANY_ID]
    );
    await c.query("COMMIT");
    c.release();

    console.log("PRE-FLIGHT owner role:", JSON.stringify(ownerRow.rows[0]));
    console.log("PRE-FLIGHT MONEY_CONTROL_VOID_REVERSAL_ENABLED (USMCA):", JSON.stringify(flagRow.rows[0]));
    console.log("PRE-FLIGHT target rows:", JSON.stringify(rows.rows, null, 2));
    console.log("PRE-FLIGHT stale>7d categorized count:", staleCount.rows[0].n);

    if (ownerRow.rows[0]?.role !== "Owner") throw new Error("ABORT: actor is not Owner-role");
    if (!flagRow.rows[0]?.enabled) throw new Error("ABORT: MONEY_CONTROL_VOID_REVERSAL_ENABLED not enabled for USMCA");
    if (rows.rows.length !== 3) throw new Error(`ABORT: expected 3 target rows, got ${rows.rows.length}`);

    for (const row of rows.rows) {
      if (row.status !== "categorized") throw new Error(`ABORT: row ${row.id} status=${row.status} (expected categorized)`);
      if (row.resolution_kind !== "added") throw new Error(`ABORT: row ${row.id} resolution_kind=${row.resolution_kind} (expected added)`);
      if (!row.matched_journal_entry_id) throw new Error(`ABORT: row ${row.id} has no matched_journal_entry_id`);
    }
  }

  if (!APPLY) {
    console.log("\nDRY-RUN — pass --apply to execute");
    await pool.end();
    return;
  }

  // EXECUTE — one transaction per bank line (independent atomics, fail-closed per line)
  const outcomes: Array<{ id: string; status: string; reversed_je_ids: string[] }> = [];
  for (const txId of TARGET_BANK_TX_IDS) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

      const outcome = await undoBankLineOnClient(c as never, {
        operatingCompanyId: USMCA_COMPANY_ID,
        bankTransactionId: txId,
        actorUserId: OWNER_USER_ID,
        reason: "CC-2 E4 2026-11-03 — uncategorize stale Zelle pending (plaid pending=true >7d)",
      });

      await c.query("COMMIT");
      outcomes.push({
        id: txId,
        status: "done",
        reversed_je_ids: outcome.reversed_journal_entry_ids,
      });
      console.log(`DONE ${txId}: reversed_je_ids=${JSON.stringify(outcome.reversed_journal_entry_ids)}, noop=${outcome.noop}`);
    } catch (err) {
      await c.query("ROLLBACK").catch(() => {});
      console.error(`FAIL ${txId}:`, (err as Error).message);
      throw err;
    } finally {
      c.release();
    }
  }

  // POST-FLIGHT verification
  {
    const c = await pool.connect();
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    const after = await c.query(
      `SELECT id::text, status, review_bucket, resolution_kind, pending, transaction_date::date
         FROM banking.bank_transactions
        WHERE id = ANY($1::uuid[])
          AND operating_company_id = $2::uuid
        ORDER BY transaction_date`,
      [TARGET_BANK_TX_IDS, USMCA_COMPANY_ID]
    );
    const staleAfter = await c.query(
      `SELECT count(*)::int AS n
         FROM banking.bank_transactions
        WHERE operating_company_id = $1::uuid
          AND pending = true
          AND status NOT IN ('uncategorized','pending_categorization')
          AND transaction_date < now() - interval '7 days'`,
      [USMCA_COMPANY_ID]
    );
    await c.query("COMMIT");
    c.release();

    console.log("\nPOST-FLIGHT rows:", JSON.stringify(after.rows, null, 2));
    console.log("POST-FLIGHT stale>7d categorized count:", staleAfter.rows[0].n);

    for (const row of after.rows) {
      if (row.review_bucket !== "for_review") {
        throw new Error(`POST-FLIGHT FAIL: row ${row.id} review_bucket=${row.review_bucket} (expected for_review)`);
      }
      if (row.resolution_kind !== null) {
        throw new Error(`POST-FLIGHT FAIL: row ${row.id} resolution_kind=${row.resolution_kind} (expected null)`);
      }
    }
    if (staleAfter.rows[0].n !== 0) {
      throw new Error(`POST-FLIGHT FAIL: stale>7d categorized count=${staleAfter.rows[0].n} (expected 0)`);
    }

    console.log("\nSUCCESS — all 3 lines returned to for_review, stale>7d categorized = 0");
    console.log(`Live=3 bank_transactions uncategorized from pending Zelle stale lines (E4)`);
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
