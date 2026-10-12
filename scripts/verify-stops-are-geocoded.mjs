#!/usr/bin/env node
// ROUND 168 JOB 2 (owner P0): "381 stops with 1 geocoded went unnoticed indefinitely; that is the
// real defect behind the defect." This guard fails when a load in a dispatchable status has any
// stop with a null latitude or a non-null geocode_failure_reason -- the actual chain the owner
// named: geocode fails -> stop has no coordinates -> geofence cannot match -> zero arrivals -> zero
// stamps -> status never advances. Samsara (proven live and healthy this same round) was never in
// this chain; this guard is scoped to geocoding specifically, not telematics.
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const ALLOW_OFFLINE_SKIP = "live-data invariant by design, no static-only path";
// verify-static.mjs's dead-port sweep asks a different question than verify-no-silent-db-skip.mjs
// (03d): the ALLOW_OFFLINE_SKIP export above is NOT passed to requireLiveDbOrExit as a runtime
// option, so this guard still correctly fails closed with no DB (ROUND 29.9-B) when actually run.
// REQUIRES_LIVE_DB is verify-static.mjs's own exclusion mechanism (see its header comment) -- a
// ROUND-29.9-B fail-closed guard is EXCLUDED from the offline dead-port sweep entirely rather than
// asked a question it cannot answer and recorded as a false-positive rot finding.
export const REQUIRES_LIVE_DB =
  "live-data invariant; fails closed with no DATABASE_URL (ROUND 29.9-B)";

const LABEL = "verify-stops-are-geocoded";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DISPATCHABLE_STATUSES = [
  "booked", "planned", "assigned", "unassigned", "assigned_not_dispatched", "dispatched",
  "at_pickup", "in_transit", "at_delivery",
];

/**
 * Row-level mirror of main()'s SQL: load numbers (dispatchable, not soft-deleted) with at least one live stop that has no
 * latitude or carries a geocode failure.
 */
export function uncoordinatedLoads(rows) {
  const out = new Set();
  for (const r of rows) {
    if (r.load_soft_deleted_at || r.stop_soft_deleted_at) continue;
    if (!DISPATCHABLE_STATUSES.includes(r.status)) continue;
    if (r.latitude == null || r.geocode_failure_reason != null) out.add(r.load_number);
  }
  return [...out].sort();
}

function selftest() {
  const stop = (over) => ({ load_number: "13700", status: "dispatched", latitude: 27.5, geocode_failure_reason: null, load_soft_deleted_at: null, stop_soft_deleted_at: null, ...over });
  const plants = [
    ["dispatched load with a stop never geocoded", [stop({ latitude: null })]],
    ["in-transit load whose geocode failed", [stop({ status: "in_transit", geocode_failure_reason: "ZERO_RESULTS" })]],
    ["one bad stop among good ones", [stop({}), stop({ load_number: "13701", status: "booked", latitude: null })]],
  ];
  const escaped = plants.filter(([, rows]) => uncoordinatedLoads(rows).length === 0).map(([n]) => n);
  const clean = uncoordinatedLoads([
    stop({}),
    stop({ load_number: "13702", status: "closed", latitude: null }), // not dispatchable
    stop({ load_number: "13703", latitude: null, stop_soft_deleted_at: "2026-10-01" }), // deleted stop
  ]);
  if (escaped.length || clean.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - escaped: ${escaped.join(", ") || "none"}\n  - clean flagged: ${clean.join(", ") || "none"}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST: ${plants.length}/${plants.length} planted violations caught (non-dispatchable and deleted stops out of scope)`);
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
      `SELECT l.load_number, l.status::text AS status, ls.latitude, ls.geocode_failure_reason,
              l.soft_deleted_at AS load_soft_deleted_at, ls.soft_deleted_at AS stop_soft_deleted_at
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

    const bad = uncoordinatedLoads(res.rows);
    if (bad.length > 0) {
      console.error(`${LABEL}: FAIL — ${bad.length} dispatchable load(s) have at least one uncoordinated stop:`);
      for (const n of bad) console.error(`  ✗ load ${n}`);
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
