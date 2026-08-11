/**
 * P36 (36 OF 50) — settlements Wave-A linkage: prove the CANONICAL open path stamps driver_id and the
 * load bookend, and leave one live USMCA settlement behind with those FKs NOT NULL.
 *
 * WHY A SMOKE ROW WAS NEEDED AT ALL: all 8 USMCA settlements are status='cancelled' (the owner
 * void-all), so the linkage was undemonstrated — the columns were populated on cancelled rows and
 * nothing live proved the path still writes them.
 *
 * ★ WHAT I DID NOT CALL A DEFECT. Six of those cancelled settlements carry first_load_id with
 * last_load_id NULL, which looks like a half-written FK. It is not: the bookends are DERIVED from the
 * settlement's covered lines by the recompute in settlements-load-bookended.service.ts, and that
 * recompute runs at CLOSE. None of the 8 is finalized, so a NULL last_load_id is the correct state for
 * an unclosed settlement, not a dropped write. Reporting it as a defect would have been a fabricated
 * finding — the kind that costs a reader more than it saves.
 *
 * Created through openLoadBookendedSettlement() — the same function dispatch calls — because a row
 * hand-inserted with SQL proves nothing about what the product does.
 *
 * Usage: npx tsx scripts/run-p36-usmca-settlement-fk-smoke-once.mts [--commit]
 */
import pg from "pg";
import { openLoadBookendedSettlement } from "../apps/backend/src/driver-finance/settlements-load-bookended.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const COMMIT = process.argv.includes("--commit");

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL required");
if (/-pooler\./.test(url)) throw new Error("REFUSING -pooler: session GUCs do not survive transaction pooling under FORCE RLS");

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

try {
  await client.query(`SELECT set_config('app.bypass_rls','lucia',false)`);
  await client.query(`SELECT set_config('app.operating_company_id',$1,false)`, [USMCA]);
  await client.query("BEGIN");

  // A REAL load with a REAL assigned driver, not sample data, and not already bookending a settlement.
  const pick = await client.query<{ load_id: string; load_number: string; driver_id: string; driver: string }>(
    `SELECT l.id::text AS load_id, l.load_number, l.assigned_primary_driver_id::text AS driver_id,
            d.first_name || ' ' || d.last_name AS driver
       FROM mdata.loads l
       JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
      WHERE l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL
        AND l.assigned_primary_driver_id IS NOT NULL
        AND COALESCE(l.is_sample_data, false) = false
        AND NOT EXISTS (SELECT 1 FROM driver_finance.driver_settlements s WHERE s.first_load_id = l.id)
      ORDER BY l.created_at DESC
      LIMIT 1`,
    [USMCA]
  );
  const t = pick.rows[0];
  if (!t) throw new Error("no eligible USMCA load with an assigned driver — refusing to invent one");
  console.log(`[P36] target · load=${t.load_number} driver=${t.driver}`);

  const opened = await openLoadBookendedSettlement(client, {
    driverId: t.driver_id,
    operatingCompanyId: USMCA,
    firstLoadId: t.load_id,
    actorUserId: ACTOR_USER_ID,
  });

  // Read the FKs back FROM THE DATABASE, never from the function's return value.
  const check = await client.query<{
    display_id: string; status: string; driver_id: string | null; first_load_id: string | null; opco: string;
  }>(
    `SELECT display_id, status, driver_id::text, first_load_id::text, operating_company_id::text AS opco
       FROM driver_finance.driver_settlements WHERE id = $1::uuid`,
    [opened.settlementId]
  );
  const r = check.rows[0];
  if (!r) throw new Error("settlement not readable back");
  console.log(`[P36] settlement=${opened.settlementNumber} (${opened.settlementId})`);
  console.log(`[P36] status=${r.status} · driver_id=${r.driver_id} · first_load_id=${r.first_load_id}`);

  const missing = [];
  if (!r.driver_id) missing.push("driver_settlements.driver_id");
  if (!r.first_load_id) missing.push("driver_settlements.first_load_id");
  if (r.opco !== USMCA) missing.push(`wrong entity ${r.opco}`);
  if (missing.length) throw new Error(`WRITE PATH DOES NOT STAMP: ${missing.join(", ")} — P36 is NOT built`);

  if (COMMIT) {
    await client.query("COMMIT");
    console.log("[P36] BUILT — canonical open path stamps driver_id + load bookend, both NOT NULL.");
  } else {
    await client.query("ROLLBACK");
    console.log("[P36] DRY RUN — assertions passed, rolled back. Re-run with --commit.");
  }
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`[P36] FAILED (rolled back): ${(err as Error)?.message ?? err}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
