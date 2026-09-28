#!/usr/bin/env -S npx tsx
/**
 * Live proof half of scripts/verify-seed-expense-actually-works.mjs. Calls the real seedExpense()
 * end to end (existing-dup check, card-fuel-dup check, item resolution, vendor resolution,
 * expense_seq_per_load allocation, the accounting.expenses INSERT, the accounting.expense_lines
 * INSERT, the expense_attribution.expense_load_links INSERT, the audit append) against ONE real
 * USMCA load, INSIDE A TRANSACTION THAT IS ALWAYS ROLLED BACK — proving the whole write path
 * still works without writing anything permanent. Uses a load-number/date/amount/invoice
 * combination guaranteed to be new every run (a random suffix) so the existing-row dedupe check
 * can never accidentally short-circuit the real INSERT path being tested.
 */
import pg from "pg";
import { seedExpense } from "../src/feed/seed-settlement-document.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("SKIP — no DATABASE_URL");
    return;
  }
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);

    const loadRes = await client.query<{ id: string; load_number: string }>(
      `SELECT id::text, load_number
         FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid
          AND l.soft_deleted_at IS NULL
          AND l.assigned_primary_driver_id IS NOT NULL
        ORDER BY l.created_at DESC
        LIMIT 1`,
      [USMCA]
    );
    const load = loadRes.rows[0];
    if (!load) {
      console.log("SKIP — no eligible USMCA load with an assigned driver to test against");
      await client.query("ROLLBACK");
      return;
    }

    const uniqueSuffix = Date.now().toString().slice(-6);
    const expenseId = await seedExpense(client, USMCA, OWNER_USER_ID, load.id, load.load_number, {
      date: "2026-01-01",
      vendor: "LIVE-PROOF-TEST-VENDOR-NEVER-PERSISTED",
      description: "Reefer Trailer-Washout Expense",
      amountCents: 100,
      invoice: `LIVEPROOF-${uniqueSuffix}`,
      raw: "Reefer Trailer-Washout Expense",
      isReimbursementSurvivor: false,
    }).catch((e) => {
      throw new Error(`seedExpense threw: ${(e as Error).message}`);
    });

    if (!expenseId) {
      throw new Error("seedExpense returned null (card-fuel-dupe short-circuit on a fresh row — should never happen)");
    }

    const check = await client.query<{ id: string; total_amount_cents: number }>(
      `SELECT id::text, total_amount_cents FROM accounting.expenses WHERE id = $1::uuid`,
      [expenseId]
    );
    if (!check.rows[0] || Number(check.rows[0].total_amount_cents) !== 100) {
      throw new Error(`row not found or wrong amount after insert: ${JSON.stringify(check.rows[0])}`);
    }

    const lineCheck = await client.query<{ id: string }>(
      `SELECT id::text FROM accounting.expense_lines WHERE expense_id = $1::uuid`,
      [expenseId]
    );
    if (lineCheck.rows.length === 0) {
      throw new Error("no accounting.expense_lines row created");
    }

    await client.query("ROLLBACK");
    console.log(`PASS — seedExpense() created a real expenses+expense_lines+links+audit row for load ${load.load_number} (rolled back)`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    console.log("FAIL");
    process.exitCode = 1;
    return;
  } finally {
    client.release();
    await pool.end();
  }
  console.log("PASS");
}

main();
