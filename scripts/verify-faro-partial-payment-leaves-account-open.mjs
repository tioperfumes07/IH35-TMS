#!/usr/bin/env node
// FARO REPURCHASE OBLIGATION — guard 4 of 5 named in
// docs/lockdown/IH35-HANDOFF-2026-08-31/specs/GO-FARO-REPURCHASE-TRACKER-2026-08-30.md.
//
// Executed Faro agreement, Repurchased Account Example 2 (transcribed in the spec): a short payment
// does NOT close the Purchased Account — it is a credit, not a settlement, and the account REMAINS
// a Purchased Account, still accruing, until the full Repurchase Price is paid. This guard fails
// when an advance `views.factoring_repurchase_obligation` flags partially_paid_still_open=true (an
// outstanding liability greater than zero but less than the original invoice total) while its OWN
// accounting.factoring_advances.status has already been moved to a closed/settled value
// ('collected', 'released', 'recourse_returned') — the exact Example-2 violation the owner corrected
// in this session (an earlier draft entry retired the liability at short-pay time and was withdrawn).
//
// Database-required: exits 2 (UNVERIFIED) if DATABASE_URL/DATABASE_DIRECT_URL is unset.
import pg from "pg";

const url = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
const CLOSED_STATUSES = ["collected", "released", "recourse_returned"];

async function main() {
  if (!url) {
    console.error("verify-faro-partial-payment-leaves-account-open: UNVERIFIED — DATABASE_URL not set, cannot check live");
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
          "verify-faro-partial-payment-leaves-account-open: SKIP — views.factoring_repurchase_obligation does not exist yet " +
          "(202613301700/202613301800 not yet applied). Not a pass — re-run once the migration lands."
        );
        process.exit(0);
        return;
      }

      const res = await client.query(
        `SELECT v.operating_company_id::text, v.display_id, v.outstanding_liability_cents, v.net_amount_cents,
                a.status
           FROM views.factoring_repurchase_obligation v
           JOIN accounting.factoring_advances a ON a.id = v.factoring_advance_id
          WHERE v.partially_paid_still_open = true
            AND a.status = ANY($1::text[])
          ORDER BY v.display_id`,
        [CLOSED_STATUSES]
      );
      await client.query("ROLLBACK");

      if (res.rows.length > 0) {
        console.error("verify-faro-partial-payment-leaves-account-open FAILED (Repurchased Account Example 2 violation):");
        for (const row of res.rows) {
          console.error(
            `  - ${row.display_id} (${row.operating_company_id}): status='${row.status}' but outstanding=${row.outstanding_liability_cents}c ` +
            `of original ${row.net_amount_cents}c -- a partial payment is a credit, not a settlement, the account must stay open`
          );
        }
        process.exit(1);
        return;
      }
      console.log("verify-faro-partial-payment-leaves-account-open: OK — no partially-paid-still-open account has been marked settled/closed");
      process.exit(0);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`verify-faro-partial-payment-leaves-account-open ERROR: ${error?.message ?? error}`);
  process.exit(2);
});
