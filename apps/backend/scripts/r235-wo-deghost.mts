#!/usr/bin/env node
/**
 * ROUND 23.5 — WO DE-GHOST. Three UPDATEs, no reverses, closes the ghost-WO trap.
 *
 * The prior wrong attempt (voided loads 13463/13475, see r235-faro-orphan-invoices-close.mts's own
 * header) still carries the two real customer WO numbers (68747, MPHC261334) on its SOFT-DELETED
 * rows. A lookup for either WO today finds only the dead row (or nothing) -- the live rows that
 * should carry them (the real load 13524 for MPHC261334, the placeholder load INV-2026-00007 for
 * 68747, already correct) are blank or missing the label. Same trap that started this whole
 * episode, still armed on the WO field specifically.
 *
 * FIX: move the WO label off the dead rows and onto the live one. Nothing voided, nothing
 * un-voided, nothing deleted -- void-not-delete holds. INV-2026-00007 already carries '68747'
 * correctly (set by r235-faro-orphan-invoices-close.mts); only load 13524 needs a positive write.
 *
 * Usage:
 *   DATABASE_URL="postgres://…" npx tsx apps/backend/scripts/r235-wo-deghost.mts            # PREVIEW (default)
 *   DATABASE_URL="postgres://…" npx tsx apps/backend/scripts/r235-wo-deghost.mts --commit   # write
 */
import pg from "pg";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA
const LOAD_13524_ID = "ab0c06d2-303d-4d44-933b-9a8cd748f4bc";
const LOAD_13463_ID = "799c4b8e-1d2d-4b7f-bbd9-9dc03b6a4b07"; // soft-deleted ghost, was wo=68747
const LOAD_13475_ID = "8057e929-180c-4845-86f5-c2f801a5a983"; // soft-deleted ghost, was wo=MPHC261334

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

    // Pre-state sanity: refuse to touch anything that isn't exactly what was verified live.
    const { rows: pre } = await client.query(
      `SELECT id, load_number, customer_wo_number, soft_deleted_at
         FROM mdata.loads WHERE id IN ($1::uuid,$2::uuid,$3::uuid) ORDER BY load_number`,
      [LOAD_13463_ID, LOAD_13475_ID, LOAD_13524_ID]
    );
    console.log("before:", JSON.stringify(pre, null, 2));
    const byId = Object.fromEntries(pre.map((r) => [r.id, r]));
    if (byId[LOAD_13524_ID]?.customer_wo_number !== null) {
      throw new Error(`Expected load 13524 customer_wo_number=NULL, found ${JSON.stringify(byId[LOAD_13524_ID])}`);
    }
    if (byId[LOAD_13463_ID]?.customer_wo_number !== "68747" || !byId[LOAD_13463_ID]?.soft_deleted_at) {
      throw new Error(`Expected load 13463 wo=68747, soft-deleted, found ${JSON.stringify(byId[LOAD_13463_ID])}`);
    }
    if (byId[LOAD_13475_ID]?.customer_wo_number !== "MPHC261334" || !byId[LOAD_13475_ID]?.soft_deleted_at) {
      throw new Error(`Expected load 13475 wo=MPHC261334, soft-deleted, found ${JSON.stringify(byId[LOAD_13475_ID])}`);
    }

    // 1. The one that matters: give the REAL load its WO.
    await client.query(
      `UPDATE mdata.loads SET customer_wo_number = 'MPHC261334', updated_at = now() WHERE id = $1::uuid`,
      [LOAD_13524_ID]
    );
    console.log("[1] load 13524: customer_wo_number -> MPHC261334");

    // 2. Strip the ghost's WO, append a note (soft_deleted_at, status, everything else untouched).
    await client.query(
      `UPDATE mdata.loads
          SET customer_wo_number = NULL,
              notes = COALESCE(notes,'') || E'\n' || 'WO 68747 belongs to load INV-2026-00007.',
              updated_at = now()
        WHERE id = $1::uuid`,
      [LOAD_13463_ID]
    );
    console.log("[2] load 13463 (soft-deleted): customer_wo_number -> NULL, note appended");

    // 3. Same for the other ghost.
    await client.query(
      `UPDATE mdata.loads
          SET customer_wo_number = NULL,
              notes = COALESCE(notes,'') || E'\n' || 'WO MPHC261334 belongs to real load 13524.',
              updated_at = now()
        WHERE id = $1::uuid`,
      [LOAD_13475_ID]
    );
    console.log("[3] load 13475 (soft-deleted): customer_wo_number -> NULL, note appended");

    // Result to prove: each WO returns exactly one row, and it is LIVE.
    const { rows: result } = await client.query(
      `SELECT customer_wo_number AS wo, load_number, (soft_deleted_at IS NULL) AS is_live
         FROM mdata.loads WHERE customer_wo_number IN ('68747','MPHC261334') ORDER BY customer_wo_number`
    );
    console.log("\nRESULT (no soft-delete filter):", JSON.stringify(result, null, 2));
    if (result.length !== 2 || !result.every((r) => r.is_live)) {
      throw new Error(`Expected exactly 2 rows, both live: ${JSON.stringify(result)}`);
    }

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
