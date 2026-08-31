#!/usr/bin/env node
// FARO REPURCHASE OBLIGATION — guard 2 of 5 named in
// docs/lockdown/IH35-HANDOFF-2026-08-31/specs/GO-FARO-REPURCHASE-TRACKER-2026-08-30.md.
//
// Executed Faro agreement: Default Interest begins on day 35 (30-day Repurchase Term + 5-day Grace
// Period), at 0.067%/day compounded. `views.factoring_repurchase_obligation.accruing_default_interest`
// flags an account as past that day-35 line with an outstanding liability. This guard fails when a
// row is flagged accruing_default_interest=true but accounting.factoring_default_interest_accruals
// has no ACTIVE row for it (or none dated on/after default_interest_starts_on) — the exact "flagged
// as accruing but no accrual actually recorded" gap named in the spec.
//
// Database-required: exits 2 (UNVERIFIED) if DATABASE_URL/DATABASE_DIRECT_URL is unset.
import pg from "pg";

const url = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";

async function main() {
  if (!url) {
    console.error("verify-faro-default-interest-accrues-from-day-35: UNVERIFIED — DATABASE_URL not set, cannot check live");
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

      const viewExists = await client.query(
        `SELECT to_regclass('views.factoring_repurchase_obligation') IS NOT NULL AS exists`
      );
      if (!viewExists.rows[0]?.exists) {
        await client.query("ROLLBACK");
        console.log(
          "verify-faro-default-interest-accrues-from-day-35: SKIP — views.factoring_repurchase_obligation does not exist yet " +
          "(202613301700/202613301800 not yet applied). Not a pass — re-run once the migration lands."
        );
        process.exit(0);
        return;
      }

      const res = await client.query(
        `SELECT v.operating_company_id::text, v.display_id, v.default_interest_starts_on::text,
                v.default_interest_unpaid_cents,
                (SELECT count(*) FROM accounting.factoring_default_interest_accruals a
                  WHERE a.factoring_advance_id = v.factoring_advance_id AND a.is_active) AS active_accrual_count,
                (SELECT count(*) FROM accounting.factoring_default_interest_accruals a
                  WHERE a.factoring_advance_id = v.factoring_advance_id AND a.is_active
                    AND a.accrual_date < v.default_interest_starts_on) AS accruals_before_day_35
           FROM views.factoring_repurchase_obligation v
          WHERE v.accruing_default_interest = true
          ORDER BY v.display_id`
      );
      await client.query("ROLLBACK");

      const failures = res.rows.filter(
        (row) => Number(row.active_accrual_count) === 0 || Number(row.accruals_before_day_35) > 0
      );

      if (failures.length > 0) {
        console.error("verify-faro-default-interest-accrues-from-day-35 FAILED:");
        for (const row of failures) {
          const reason =
            Number(row.active_accrual_count) === 0
              ? "flagged accruing_default_interest=true but has ZERO active accrual rows"
              : `has ${row.accruals_before_day_35} accrual row(s) dated BEFORE default_interest_starts_on (${row.default_interest_starts_on})`;
          console.error(`  - ${row.display_id} (${row.operating_company_id}): ${reason}`);
        }
        process.exit(1);
        return;
      }
      console.log(
        `verify-faro-default-interest-accrues-from-day-35: OK — ${res.rows.length} accruing account(s) all have a real active accrual row, none dated before day 35`
      );
      process.exit(0);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`verify-faro-default-interest-accrues-from-day-35 ERROR: ${error?.message ?? error}`);
  process.exit(2);
});
