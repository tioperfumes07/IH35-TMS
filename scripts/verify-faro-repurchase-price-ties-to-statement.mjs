#!/usr/bin/env node
// FARO REPURCHASE OBLIGATION — guard 3 of 5 named in
// docs/lockdown/IH35-HANDOFF-2026-08-31/specs/GO-FARO-REPURCHASE-TRACKER-2026-08-30.md.
//
// "repurchase-price-ties-to-faro-statement: summed repurchase_price_cents != Faro's statement
// outstanding — tolerance 0." Unlike guards 1/2/4/5 (which check the view's own already-defined
// booleans for internal consistency), THIS one requires an EXTERNAL reference figure — Faro's own
// current statement outstanding-repurchase-obligation total — which is not yet wired into this repo
// anywhere (scripts/tieout/faro-factoring-statement.mjs's own EXPECTED constant is the FACE/
// reserve/fee/cash figures for a specific 33-invoice cohort as of a specific statement date, not a
// live "current total repurchase price owed" figure — they are not the same number and must not be
// conflated).
//
// Honest state: EXPECTED_REPURCHASE_TOTAL_CENTS below is null until someone transcribes it from a
// REAL, current Faro statement (the same discipline as the other tie-outs: never invent the
// expected value, never move it to force a pass). Until then this reports UNVERIFIED, not a fake
// PASS or a hard FAIL on a made-up number.
import pg from "pg";

const url = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";

// Fill this in from a REAL, current Faro statement's total outstanding repurchase obligation
// (Repurchase Price, summed across every open Purchased Account) before this guard can do a real
// tie-out. Do not guess it from the tie-out's own EXPECTED face value — that is a different figure.
export const EXPECTED_REPURCHASE_TOTAL_CENTS = null;
export const TOLERANCE_CENTS = 0;

if (process.argv.includes("--expected-only")) {
  console.log(JSON.stringify({ expected_repurchase_total_cents: EXPECTED_REPURCHASE_TOTAL_CENTS, tolerance_cents: TOLERANCE_CENTS }));
  process.exit(0);
}

async function main() {
  if (EXPECTED_REPURCHASE_TOTAL_CENTS == null) {
    console.error(
      "verify-faro-repurchase-price-ties-to-statement UNVERIFIED: EXPECTED_REPURCHASE_TOTAL_CENTS is not yet " +
      "transcribed from a real, current Faro statement -- there is nothing to tie out against. " +
      "This is honest UNVERIFIED, not a pass. Fill in the constant from the actual statement to activate this guard."
    );
    process.exit(2);
    return;
  }
  if (!url) {
    console.error("verify-faro-repurchase-price-ties-to-statement: UNVERIFIED — DATABASE_URL not set, cannot check live");
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
          "verify-faro-repurchase-price-ties-to-statement: SKIP — views.factoring_repurchase_obligation does not exist yet. " +
          "Not a pass — re-run once the migration lands."
        );
        process.exit(0);
        return;
      }

      const res = await client.query(
        `SELECT COALESCE(SUM(repurchase_price_cents), 0)::bigint AS total_cents
           FROM views.factoring_repurchase_obligation
          WHERE outstanding_liability_cents > 0`
      );
      await client.query("ROLLBACK");

      const actual = Number(res.rows[0]?.total_cents ?? 0);
      const variance = actual - EXPECTED_REPURCHASE_TOTAL_CENTS;

      if (Math.abs(variance) > TOLERANCE_CENTS) {
        console.error(
          `verify-faro-repurchase-price-ties-to-statement FAILED: live=${actual}c expected=${EXPECTED_REPURCHASE_TOTAL_CENTS}c ` +
          `variance=${variance}c (tolerance ${TOLERANCE_CENTS}c)`
        );
        process.exit(1);
        return;
      }
      console.log(`verify-faro-repurchase-price-ties-to-statement: OK — live ${actual}c ties to the statement (tolerance ${TOLERANCE_CENTS}c)`);
      process.exit(0);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`verify-faro-repurchase-price-ties-to-statement ERROR: ${error?.message ?? error}`);
  process.exit(2);
});
