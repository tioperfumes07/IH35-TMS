#!/usr/bin/env node
// FARO REPURCHASE OBLIGATION — guard 1 of 5 named in
// docs/lockdown/IH35-HANDOFF-2026-08-31/specs/GO-FARO-REPURCHASE-TRACKER-2026-08-30.md.
//
// Executed Faro agreement: Repurchase Deadline is 95 calendar days from Purchase Date — the hard
// backstop where, per the agreement, the money actually leaves (recourse). This guard fails when
// any Purchased Account is past that deadline while still carrying an outstanding liability —
// `views.factoring_repurchase_obligation.past_repurchase_deadline` already computes this exactly
// (db/migrations 202613301700/202613301800, not yet applied at authoring time — this guard is a
// no-op SKIP, not a fake PASS, until that view exists live).
//
// Database-required: exits 2 (UNVERIFIED) if DATABASE_URL/DATABASE_DIRECT_URL is unset, matching
// this repo's SKIP-capability convention (never treat "couldn't check" as "passed").
import pg from "pg";

const url = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";

async function main() {
  if (!url) {
    console.error("verify-faro-no-purchased-account-past-repurchase-deadline: UNVERIFIED — DATABASE_URL not set, cannot check live");
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
          "verify-faro-no-purchased-account-past-repurchase-deadline: SKIP — views.factoring_repurchase_obligation does not exist yet " +
          "(202613301700/202613301800 not yet applied). Not a pass — re-run once the migration lands."
        );
        process.exit(0);
        return;
      }

      const res = await client.query(
        `SELECT operating_company_id::text, display_id, purchase_date::text, repurchase_deadline_date::text,
                days_to_repurchase_deadline, outstanding_liability_cents, repurchase_price_cents
           FROM views.factoring_repurchase_obligation
          WHERE past_repurchase_deadline = true
          ORDER BY repurchase_deadline_date ASC`
      );
      await client.query("ROLLBACK");

      if (res.rows.length > 0) {
        console.error("verify-faro-no-purchased-account-past-repurchase-deadline FAILED:");
        for (const row of res.rows) {
          console.error(
            `  - ${row.display_id} (${row.operating_company_id}): purchase_date=${row.purchase_date} ` +
            `deadline=${row.repurchase_deadline_date} (${row.days_to_repurchase_deadline}d) ` +
            `outstanding=${row.outstanding_liability_cents}c repurchase_price=${row.repurchase_price_cents}c`
          );
        }
        process.exit(1);
        return;
      }
      console.log("verify-faro-no-purchased-account-past-repurchase-deadline: OK — no Purchased Account is past its 95-day repurchase deadline with an outstanding liability");
      process.exit(0);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`verify-faro-no-purchased-account-past-repurchase-deadline ERROR: ${error?.message ?? error}`);
  process.exit(2);
});
