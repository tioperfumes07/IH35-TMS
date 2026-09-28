#!/usr/bin/env node
// ROUND 168 JOB 2 (owner P0): "381 stops with 1 geocoded went unnoticed indefinitely; that is the
// real defect behind the defect." This guard fails when a load in a dispatchable status has any
// stop with a null latitude or a non-null geocode_failure_reason -- the actual chain the owner
// named: geocode fails -> stop has no coordinates -> geofence cannot match -> zero arrivals -> zero
// stamps -> status never advances. Samsara (proven live and healthy this same round) was never in
// this chain; this guard is scoped to geocoding specifically, not telematics.
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const ALLOW_OFFLINE_SKIP = "live-data invariant by design, no static-only path";

const LABEL = "verify-stops-are-geocoded";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DISPATCHABLE_STATUSES = [
  "booked", "planned", "assigned", "unassigned", "assigned_not_dispatched", "dispatched",
  "at_pickup", "in_transit", "at_delivery",
];

function selftest() {
  console.log(`${LABEL} selftest OK — this guard is a live-data check by design (no pure logic to unit test beyond the SQL itself)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    // SET LOCAL ROLE neondb_owner removed 2026-09-28: a read-only CI credential can set the
    // app.bypass_rls GUC but cannot escalate role membership ("permission denied to set role").
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    const res = await client.query(
      `SELECT DISTINCT l.load_number
         FROM mdata.loads l
         JOIN mdata.load_stops ls ON ls.load_id = l.id AND ls.soft_deleted_at IS NULL
        WHERE l.operating_company_id = $1::uuid
          AND l.soft_deleted_at IS NULL
          AND l.status::text = ANY($2::text[])
          AND (ls.latitude IS NULL OR ls.geocode_failure_reason IS NOT NULL)
        ORDER BY l.load_number`,
      [USMCA, DISPATCHABLE_STATUSES]
    );
    await client.query("ROLLBACK");

    if (res.rows.length > 0) {
      console.error(`${LABEL}: FAIL — ${res.rows.length} dispatchable load(s) have at least one uncoordinated stop:`);
      for (const r of res.rows) console.error(`  ✗ load ${r.load_number}`);
      process.exit(1);
    }
    console.log(`${LABEL}: PASS — every dispatchable load's stops are geocoded.`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL — ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
