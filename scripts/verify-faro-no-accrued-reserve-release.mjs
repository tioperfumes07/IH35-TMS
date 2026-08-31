#!/usr/bin/env node
// FARO REPURCHASE OBLIGATION — guard 5 of 5 named in
// docs/lockdown/IH35-HANDOFF-2026-08-31/specs/GO-FARO-REPURCHASE-TRACKER-2026-08-30.md.
//
// Executed Faro agreement: reserve release happens ONLY when Faro is paid the Repurchase Price AND
// Seller is not in default AND Equity Holder is not in default — Faro has NO obligation to release
// reserve on an account not converted to cash. The spec is explicit: "Never accrue an expected
// reserve release... Recognize on receipt only." This guard fails when
// accounting.factoring_reserve_movements has a 'released' row for an advance whose OWN
// accounting.factoring_advances.status has not reached a cash-received terminal state
// ('collected' or 'released') -- i.e. the reserve was recognized as released before the advance
// itself shows the money actually came back.
//
// Database-required: exits 2 (UNVERIFIED) if DATABASE_URL/DATABASE_DIRECT_URL is unset.
import pg from "pg";

const url = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
const CASH_RECEIVED_STATUSES = ["collected", "released"];

async function main() {
  if (!url) {
    console.error("verify-faro-no-accrued-reserve-release: UNVERIFIED — DATABASE_URL not set, cannot check live");
    process.exit(2);
    return;
  }
  const pool = new pg.Pool({ connectionString: url });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET TRANSACTION READ ONLY");
      await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

      const tableExists = await client.query(
        `SELECT to_regclass('accounting.factoring_reserve_movements') IS NOT NULL AS exists`
      );
      if (!tableExists.rows[0]?.exists) {
        await client.query("ROLLBACK");
        console.log(
          "verify-faro-no-accrued-reserve-release: SKIP — accounting.factoring_reserve_movements does not exist yet. " +
          "Not a pass — re-run once it's applied."
        );
        process.exit(0);
        return;
      }

      const res = await client.query(
        `SELECT m.id::text AS movement_id, m.operating_company_id::text, a.display_id, a.status,
                m.amount_cents, m.movement_date::text
           FROM accounting.factoring_reserve_movements m
           JOIN accounting.factoring_advances a ON a.id = m.factoring_advance_id
          WHERE m.movement_type = 'released'
            AND m.is_active
            AND NOT (a.status = ANY($1::text[]))
          ORDER BY m.movement_date`,
        [CASH_RECEIVED_STATUSES]
      );
      await client.query("ROLLBACK");

      if (res.rows.length > 0) {
        console.error("verify-faro-no-accrued-reserve-release FAILED (reserve released before cash receipt):");
        for (const row of res.rows) {
          console.error(
            `  - ${row.display_id} (${row.operating_company_id}): reserve movement ${row.movement_id} released ` +
            `${row.amount_cents}c on ${row.movement_date}, but advance status is '${row.status}' -- Faro has no obligation ` +
            `to release reserve on an account not converted to cash`
          );
        }
        process.exit(1);
        return;
      }
      console.log("verify-faro-no-accrued-reserve-release: OK — every reserve-release movement corresponds to an advance whose status confirms cash was actually received");
      process.exit(0);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`verify-faro-no-accrued-reserve-release ERROR: ${error?.message ?? error}`);
  process.exit(2);
});
