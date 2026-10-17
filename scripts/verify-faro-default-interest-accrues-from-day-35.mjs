#!/usr/bin/env node
export const REQUIRES_LIVE_DB = "Neon live verification required";

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
// LEAD 443.187 (CC-2 2026-10-17) — REPOINTED to the owner's ruling, same rule ("an account past day 35 must not go
// un-accrued, and nothing accrues before day 35"): 6e94681aa0 (ACCT-F2972, Lead ROUND 296 / 297, owner 2026-10-02)
// RETIRED the nightly accrual ("default interest accrues at period close with approval (DR 6830 / CR 2155), not
// nightly" — default-interest.service.ts NIGHTLY_INTEREST_ACCRUAL_RETIRED). Accrual now lands through the period-close
// run (accounting.factoring_interest_accrual_runs, state 'posted', + its run_lines per purchase line). So:
//   FAIL  an accruing line covered by a POSTED period-close run (run.period_end >= default_interest_starts_on) that the
//         run omitted — the real "flagged accruing, never accrued" gap;
//   FAIL  any accrual (nightly row, or run line) dated before the line's default_interest_starts_on;
//   LIST  accruing lines no posted run has covered yet — awaiting the owner's period close, not a defect.
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
          "verify-faro-default-interest-accrues-from-day-35: UNVERIFIED — views.factoring_repurchase_obligation does not exist (no migration in db/migrations builds it; the 202613301700/202613301800 it names were never written) " +
          "(202613301700/202613301800 not yet applied). Not a pass — re-run once the migration lands."
        );
        process.exit(2); // UNVERIFIED, never a pass: the subject this guard polices has never been built
        return;
      }

      const res = await client.query(
        `SELECT v.operating_company_id::text, v.display_id, v.default_interest_starts_on::text,
                v.default_interest_unpaid_cents,
                (SELECT count(*) FROM accounting.factoring_default_interest_accruals a
                  WHERE a.factoring_advance_id = v.factoring_advance_id AND a.is_active
                    AND a.accrual_date < v.default_interest_starts_on) AS nightly_before_day_35,
                (SELECT count(*) FROM accounting.factoring_interest_accrual_runs r
                  WHERE r.operating_company_id = v.operating_company_id AND r.state = 'posted'
                    AND r.period_end >= v.default_interest_starts_on) AS covering_posted_runs,
                (SELECT count(*) FROM accounting.factoring_interest_accrual_runs r
                   JOIN accounting.factoring_interest_accrual_run_lines l ON l.run_id = r.id
                  WHERE r.operating_company_id = v.operating_company_id AND r.state = 'posted'
                    AND r.period_end >= v.default_interest_starts_on AND l.purchase_line_id = v.purchase_line_id) AS covered_lines,
                (SELECT count(*) FROM accounting.factoring_interest_accrual_runs r
                   JOIN accounting.factoring_interest_accrual_run_lines l ON l.run_id = r.id
                  WHERE r.operating_company_id = v.operating_company_id AND r.state = 'posted'
                    AND l.purchase_line_id = v.purchase_line_id AND r.period_end < v.default_interest_starts_on
                    AND l.accrual_cents > 0) AS run_accrual_before_day_35
           FROM views.factoring_repurchase_obligation v
          WHERE v.accruing_default_interest = true
          ORDER BY v.display_id`
      );
      await client.query("ROLLBACK");

      const failures = [];
      const awaiting = [];
      for (const row of res.rows) {
        if (Number(row.nightly_before_day_35) > 0 || Number(row.run_accrual_before_day_35) > 0) {
          failures.push(`${row.display_id} (${row.operating_company_id}): accrued BEFORE default_interest_starts_on (${row.default_interest_starts_on})`);
        } else if (Number(row.covering_posted_runs) > 0 && Number(row.covered_lines) === 0) {
          failures.push(`${row.display_id} (${row.operating_company_id}): accruing since ${row.default_interest_starts_on} but the posted period-close run(s) covering it omitted the line`);
        } else if (Number(row.covering_posted_runs) === 0) {
          awaiting.push(row.display_id);
        }
      }

      if (failures.length > 0) {
        console.error("verify-faro-default-interest-accrues-from-day-35 FAILED:");
        for (const f of failures) console.error(`  - ${f}`);
        process.exit(1);
        return;
      }
      console.log(
        `verify-faro-default-interest-accrues-from-day-35: OK — ${res.rows.length} accruing account(s): none accrued before day 35, none omitted by a posted period-close run; LISTED ${awaiting.length} awaiting the owner's first period-close accrual run`
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
