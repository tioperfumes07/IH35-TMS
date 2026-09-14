#!/usr/bin/env node
/**
 * P1 2026-09-14 — LOAD-NUMBER-COUNTER-POISONED. Corrects lib.trace_counters(doc_type='LOAD') for
 * USMCA, which was seeded from a status='cancelled' test/ghost booking instead of the true working
 * max, so the next mint (13762) was 166 above the owner's real next load (13596).
 *
 * ROOT CAUSE (apps/backend/src/dispatch/load-id-reservation.service.ts allocateNextLoadNumber):
 * the one-time lazy seed ran MAX(load_number::bigint) WHERE load_number ~ '^[0-9]+$' with no
 * status filter. Two CC-1 live-proof test bookings (loads 13743 and 13749, both created 2026-09-09,
 * both cancelled the same day, both self-documented in their own cancel_reason as "CC-1 test load
 * ... Not a real freight movement") existed above the true working max (13595, dispatched,
 * 2026-09-11) when the seed ran. MAX() trusted the highest one (13749) with no idea it was a
 * ghost, then lib.next_trace_no burned 12 more mints on top of that to reach 13761.
 *
 * VERDICT ON 13743/13749 (live-queried, not assumed): both are CC-1's own cancelled test bookings,
 * self-identified in their own cancel_reason text as "Not a real freight movement." Neither is
 * touched by this script -- NOT A REVERSAL, no load is voided/un-voided/renumbered/deleted. This
 * is a counter correction only.
 *
 * This is the RECORDED register for the correction: prints the old value, the new value, and the
 * reason before writing, and again after, for the commit/PR evidence trail.
 *
 * Usage:
 *   DATABASE_URL="postgres://…" npx tsx apps/backend/scripts/p1-fix-load-number-counter-seed.mts            # PREVIEW
 *   DATABASE_URL="postgres://…" npx tsx apps/backend/scripts/p1-fix-load-number-counter-seed.mts --commit   # write
 */
import pg from "pg";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA
const TRUE_WORKING_MAX = "13595"; // real, dispatched, 2026-09-11 -- verified live, no ghost above it
const REASON =
  "P1 2026-09-14 LOAD-NUMBER-COUNTER-POISONED: seed picked up status='cancelled' test loads " +
  "13743/13749 (both self-documented as 'CC-1 test load ... Not a real freight movement', both " +
  "created+cancelled 2026-09-09) instead of the true working max 13595 (real, dispatched, " +
  "2026-09-11). Corrected so the next mint is the owner's next number, 13596. Not a reversal -- " +
  "13743/13749 are untouched, still cancelled, still hold their numbers.";

async function main(): Promise<void> {
  const commit = process.argv.includes("--commit");
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL required");

  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.operating_company_id',$1,true)", [OPCO]);

    const { rows: before } = await client.query<{ last_trace_no: string; updated_at: string }>(
      `SELECT last_trace_no::text, updated_at::text FROM lib.trace_counters WHERE operating_company_id = $1::uuid AND doc_type = 'LOAD'`,
      [OPCO]
    );
    if (before.length !== 1) throw new Error(`Expected exactly 1 LOAD counter row for USMCA, found ${before.length}`);
    console.log("REGISTER — BEFORE:", JSON.stringify(before[0]));

    // Collision re-check, immediately before writing (item 4): the corrected next number must not
    // exist anywhere, live or soft-deleted.
    const nextNumber = String(BigInt(TRUE_WORKING_MAX) + 1n);
    const { rows: collision } = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = $2`,
      [OPCO, nextNumber]
    );
    if (collision[0].n !== "0") {
      throw new Error(`Collision check FAILED: ${collision[0].n} row(s) already hold load_number ${nextNumber}. Refusing to write.`);
    }
    console.log(`Collision check: load_number ${nextNumber} exists in 0 rows (live or soft-deleted). Safe to proceed.`);

    // Independently re-verify the true working max right before writing (never trust a cached
    // number from earlier in the session) -- must equal TRUE_WORKING_MAX exactly, with no
    // non-cancelled row above it.
    const { rows: maxCheck } = await client.query<{ max_working: string | null }>(
      `SELECT MAX(load_number::bigint)::text AS max_working
         FROM mdata.loads
        WHERE operating_company_id = $1::uuid
          AND load_number ~ '^[0-9]+$'
          AND status <> 'cancelled'`,
      [OPCO]
    );
    if (maxCheck[0].max_working !== TRUE_WORKING_MAX) {
      throw new Error(
        `Live true-working-max is ${maxCheck[0].max_working}, not the expected ${TRUE_WORKING_MAX} -- state changed since verification, refusing to write a stale value.`
      );
    }

    await client.query(
      `UPDATE lib.trace_counters SET last_trace_no = $2::bigint, updated_at = now()
        WHERE operating_company_id = $1::uuid AND doc_type = 'LOAD'`,
      [OPCO, TRUE_WORKING_MAX]
    );

    const { rows: after } = await client.query<{ last_trace_no: string; updated_at: string }>(
      `SELECT last_trace_no::text, updated_at::text FROM lib.trace_counters WHERE operating_company_id = $1::uuid AND doc_type = 'LOAD'`,
      [OPCO]
    );
    console.log("REGISTER — AFTER:", JSON.stringify(after[0]));
    console.log("REGISTER — REASON:", REASON);
    console.log(`Next mint will be ${nextNumber}.`);

    if (commit) {
      await client.query("COMMIT");
      console.log("\nCOMMITTED.");
    } else {
      await client.query("ROLLBACK");
      console.log("\nPREVIEW ONLY -- rolled back. Re-run with --commit to persist.");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
