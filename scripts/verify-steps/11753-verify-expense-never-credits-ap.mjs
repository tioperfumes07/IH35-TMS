#!/usr/bin/env node
/**
 * GUARD-EXPENSE-NEVER-CREDITS-AP (ROUND 290.2 / canonical guard #9)
 *
 * CANONICAL RULE (owner law): a Bill IS Accounts Payable; an expense document is not. An expense
 * may credit ONLY a real payment instrument (any catalogs.accounts row an operator has set as
 * payment_account_uuid -- typically 1000 Bank, 2510 Dreamline, or 1295 Relay Fuel Wallet). An
 * expense document may NEVER credit account 2000 Accounts Payable -- money owed and unpaid to a
 * vendor is a Bill (accounting.bills), not an Expense.
 *
 * ROOT CAUSE FIXED (apps/backend/src/accounting/posting-engine.service.ts, buildExpenseLines):
 * a deliberate "accrual exception" branch used to credit the AP control account whenever an
 * expense had a vendor_uuid but no payment_account_uuid. Removed -- that shape now refuses to post
 * (ACCOUNT_MAPPING_MISSING), directing the caller to enter a Bill instead.
 *
 * Live-measured 2026-09-30 (USMCA), before correction: 3 expense-sourced JEs credited account 2000
 * for $566.35 total. Corrected by scripts/ops/2026-09-30-cc1-auth149-void-3-ap-expenses-create-
 * bills.ts (void the 3 expenses, create a real Bill for each vendor/amount instead).
 *
 * Fail-closed, live: zero live expense-sourced journal entries credit account 2000, in any entity.
 */
import pg from "pg";

export const ALLOW_OFFLINE_SKIP = "requires DATABASE_URL to query live GL state; no static code-shape substitute exists for a live count";

const LABEL = "verify-expense-never-credits-ap";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(`[${LABEL}] SKIP -- no DATABASE_URL (${ALLOW_OFFLINE_SKIP})`);
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("RESET ROLE").catch(() => {});
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    const res = await client.query(
      `SELECT jep.operating_company_id::text AS operating_company_id,
              jep.source_transaction_id AS expense_id,
              jep.amount_cents::text AS amount_cents
         FROM accounting.journal_entry_postings jep
         JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
         JOIN catalogs.accounts a
           ON a.id = jep.account_id AND a.operating_company_id = jep.operating_company_id
        WHERE jep.source_transaction_type = 'expense'
          AND jep.debit_or_credit = 'credit'
          AND a.account_number = '2000'
          AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL`
    );

    await client.query("COMMIT");

    const n = res.rows.length;
    console.log(`[${LABEL}] live expense-sourced JE lines crediting account 2000: ${n}`);

    if (n > 0) {
      console.error(
        `[${LABEL}] FAIL -- canonical guard #9 violated. ${n} expense document(s) credit 2000 A/P: ` +
          `${res.rows.map((r) => `${r.expense_id} ($${(Number(r.amount_cents) / 100).toFixed(2)}, entity ${r.operating_company_id})`).join(", ")}. ` +
          `An unpaid vendor obligation is a Bill, not an Expense -- void the expense and enter a Bill instead.`
      );
      process.exitCode = 1;
      return;
    }

    console.log(`[${LABEL}] PASS -- no expense document credits Accounts Payable.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`[${LABEL}] ERROR`, err);
  process.exitCode = 1;
});
