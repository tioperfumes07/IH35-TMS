#!/usr/bin/env node
// Guards against the exact defect class found in BACKFILL-REV-E-LIVE-LOAD-NUMBER-SCHEMA-BUGS /
// LIVE-LOAD-NUMBER-BACKFILL-STILL-PLACEHOLDER-NOT-REAL-AT (2026-08-31): `mdata.loads.live_load_number`
// is the real-world AlwaysTrack reference for a historical-import load (see
// book-load.service.ts:898-899, which REQUIRES a non-blank live_load_number to book via that path).
// A caller who doesn't yet know the real AT# can satisfy that requirement by typing the load's own
// internal `load_number` back into `live_load_number` as a placeholder -- this happened for 9 of the
// 12 REV-E loads (L-20260830-0008..0019) and would have silently defeated any downstream AT#-based
// invoice/load linkage, since `live_load_number` looked "set" (non-null) while carrying no real
// AlwaysTrack reference at all.
//
// This guard fails when ANY non-deleted load has `live_load_number = load_number` exactly --
// a load's own generated display id (`L-YYYYMMDD-NNNN`) can never legitimately be its own
// AlwaysTrack number. The fix for a flagged row is to correct `live_load_number` to the real AT#
// (or null it back out, per LAW-BLAST-RADIUS-NO-VERTICAL-FIXES-2026-08-31's "revert the 11"
// instruction) -- never to leave the placeholder standing.
//
// Database-required: exits 2 (UNVERIFIED) if DATABASE_URL/DATABASE_DIRECT_URL is unset, matching this
// repo's SKIP-capability convention (never treat "couldn't check" as "passed").
import pg from "pg";

const url = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";

async function main() {
  if (!url) {
    console.error("verify-live-load-number-not-self-referential: UNVERIFIED — DATABASE_URL not set, cannot check live");
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

      const res = await client.query(
        `SELECT operating_company_id::text, load_number
           FROM mdata.loads
          WHERE live_load_number = load_number
            AND soft_deleted_at IS NULL
          ORDER BY load_number`
      );
      await client.query("ROLLBACK");

      if (res.rows.length > 0) {
        console.error("verify-live-load-number-not-self-referential FAILED:");
        for (const row of res.rows) {
          console.error(
            `  - ${row.load_number} (${row.operating_company_id}): live_load_number equals its own load_number ` +
              `— that is a placeholder, never a real AlwaysTrack reference`
          );
        }
        process.exit(1);
        return;
      }
      console.log("verify-live-load-number-not-self-referential: OK — no load carries its own load_number as a placeholder live_load_number");
      process.exit(0);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`verify-live-load-number-not-self-referential ERROR: ${error?.message ?? error}`);
  process.exit(2);
});
