#!/usr/bin/env node
/**
 * GUARD-FUEL-EXPENSE-BRIDGE-IS-WHOLE (ROUND 290.1)
 *
 * CANONICAL RULE (see apps/backend/src/fuel/fuel-expense-document.service.ts header): a fuel
 * purchase is ONE economic event. fuel.fuel_transactions is the operational source-of-truth;
 * accounting.expenses is its accounting projection; source_fuel_transaction_id is the mandatory
 * join key in BOTH directions.
 *
 * Fail-closed, live, per entity with USMCA-scale fuel activity today:
 *   (a) zero live fuel.fuel_transactions rows without a live linked accounting.expenses row.
 *   (b) zero live accounting.expenses rows posting to GL account 5000 "Fuel & Diesel" without a
 *       source_fuel_transaction_id -- EXCEPT rows carrying source_settlement_ref, which are
 *       driver-settlement-derived fuel-category line items (DEF, reefer diesel, etc.) with no
 *       fuel-card transaction to link to by construction -- documented exemption, not a gap.
 *
 * Live-measured 2026-09-30 (USMCA, before this round's backfill): (a) 34 unlinked fuel rows,
 * (b) 190 unlinked 5000 expenses, of which 178 carry source_settlement_ref (exempt) and 12 do
 * not -- 8 are stray "Fuel-DEF-Diesel Exhaust Fluid" rows with no expense_number and no
 * provenance marker (flagged for the Lead/owning seat separately, not fixed by this guard) and 4
 * are settlement-derived ("ATGTx settl ... reissued") rows missing their source_settlement_ref
 * despite the memo showing they came from one.
 */
import pg from "pg";

export const ALLOW_OFFLINE_SKIP = "requires DATABASE_URL to query live GL state; no static code-shape substitute exists for a live count";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LABEL = "verify-fuel-expense-bridge-is-whole";

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

    const fuelWithoutExpense = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM fuel.fuel_transactions ft
        WHERE ft.operating_company_id = $1::uuid
          AND ft.voided_at IS NULL
          AND ft.archived_at IS NULL
          AND ft.total_cost IS NOT NULL AND ft.total_cost::numeric > 0
          AND NOT EXISTS (
            SELECT 1 FROM accounting.expenses e
             WHERE e.source_fuel_transaction_id = ft.id AND e.voided_at IS NULL
          )`,
      [USMCA_COMPANY_ID]
    );

    const expenseWithoutFuel = await client.query<{ count: string }>(
      `SELECT count(DISTINCT e.id)::text AS count
         FROM accounting.expenses e
         JOIN accounting.journal_entry_postings jep
           ON jep.source_transaction_type = 'expense' AND jep.source_transaction_id = e.id::text
              AND jep.operating_company_id = e.operating_company_id
         JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
         JOIN catalogs.accounts a ON a.id = jep.account_id
        WHERE e.operating_company_id = $1::uuid
          AND e.voided_at IS NULL
          AND e.source_fuel_transaction_id IS NULL
          AND e.source_settlement_ref IS NULL
          AND a.account_number = '5000'
          AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL`,
      [USMCA_COMPANY_ID]
    );

    await client.query("COMMIT");

    const a = Number(fuelWithoutExpense.rows[0].count);
    const b = Number(expenseWithoutFuel.rows[0].count);

    console.log(`[${LABEL}] fuel rows without a live expense: ${a}`);
    console.log(`[${LABEL}] non-exempt 5000 expenses without a fuel transaction: ${b}`);

    if (a > 0 || b > 0) {
      console.error(
        `[${LABEL}] FAIL -- bridge is not whole. ${a} fuel rows have no expense document; ` +
          `${b} account-5000 expenses (excluding source_settlement_ref rows) have no fuel_transaction. ` +
          `A fuel purchase must always produce both sides. See apps/backend/src/fuel/fuel-expense-document.service.ts header.`
      );
      process.exitCode = 1;
      return;
    }

    console.log(`[${LABEL}] PASS -- fuel-to-expense bridge is whole.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`[${LABEL}] ERROR`, err);
  process.exitCode = 1;
});
