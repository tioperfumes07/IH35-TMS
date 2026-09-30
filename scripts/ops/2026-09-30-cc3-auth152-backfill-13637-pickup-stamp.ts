#!/usr/bin/env npx tsx
/**
 * AUTH-152 — DISPATCH-STAMPS (owner order, 2026-09-30): "13630 / 13634 / 13635 / 13637: both stops
 * exist and are correctly typed, ZERO actual_arrival_at and actual_departure_at, actual_arrival_source
 * NULL on all 8 stops... Backfill them from the real geofence events; where no event exists, leave
 * NULL and report the count -- never invent a timestamp."
 *
 * MEASURED (this script's own root cause, live, USMCA 5c854333-6ea5-4faa-af31-67cb272fef80):
 * dispatch.stop_arrivals (the real, live geofence/ELD-proximity detector's own output table --
 * apps/backend/src/telematics/arrival-detection.service.ts) has ZERO rows for any of the 8 pickup
 * or delivery stops on these 4 loads -- the automated detector never fired for any of them.
 * telematics.vehicle_locations (raw Samsara GPS pings, real telemetry, never synthetic) DOES carry
 * dense position history for all 4 assigned units across the relevant window. Of the 4 pickups,
 * only ONE -- 13637, unit T176, Wilkes-Barre PA -- shows the unit's GPS track actually converging
 * on the stop's own geocoded coordinates (41.2204956,-75.8744687; geocode_source=google_geocoding,
 * confidence=0.5, precision=rooftop): a clean, monotonic approach from 15:03 UTC (474,399 ft away)
 * down to a ~293 ft dwell held steady from 17:35:04 to 18:35:14 UTC on 2026-09-28, then a rapid,
 * monotonic departure back out past 2,000+ ft by 18:40:09. 293 ft is just outside the live
 * detector's own 250 ft ARRIVAL_RADIUS_FEET (arrival-detection.service.ts) -- which is exactly why
 * the automated detector never caught this real, physical arrival: GPS/facility-footprint noise
 * put the truck a few dozen feet outside the strict cutoff the whole time it was actually parked at
 * the dock. This script does not touch the live detector's threshold; it stamps ONE real, already-
 * occurred event using the same real data the detector reads, at a threshold (500 ft) wide enough to
 * cover a large facility's dock spacing without needing a second automated re-run.
 *
 * THE OTHER THREE (13630 unit T164 / Tar Heel NC, 13634 unit T152 / Elkhart IN, 13635 unit T148 /
 * Bridgeton NJ): NO plausible GPS convergence exists anywhere in the unit's full position history
 * since load creation (2026-09-28 ~09:00 UTC) through now. Closest approach measured: 13630 = 5,963
 * ft (~1.1 mi), 13634 = 172,982 ft (~32.8 mi), 13635 = 5,438,523 ft (~1,030 mi -- the unit was never
 * within a thousand miles of the stop during this window). All three pickup addresses are
 * independently well-geocoded (confidence 0.5-0.95, rooftop precision) -- this is not a geocode
 * error on the stop side. There is no real geofence/GPS event for these three, in this data, at this
 * address. Per the owner's own instruction, this script deliberately leaves all three NULL rather
 * than invent or infer a timestamp; the count (3 of 4 not backfillable) is reported below and in the
 * companion finding doc. A follow-up investigation (pickup possibly occurred at a different physical
 * location than the address on file -- common for drop-yard vs. dock-address mismatches) is
 * out of scope for this script.
 *
 * SCOPE: exactly the ONE pickup stop on load 13637 (stop id 005d414c-66ba-484d-bc0a-1d99e0be8fe6).
 * Writes actual_arrival_at, actual_departure_at, actual_arrival_source (='eld_geofence' -- an
 * honest label: this genuinely is an ELD/GPS-position-derived determination, computed retroactively
 * from the same telematics.vehicle_locations feed the live detector reads, not the driver app and
 * not a human guess). Does NOT touch mdata.loads.status, does NOT call stampStopArrival/
 * stampStopDeparture (both hardcode now() for a live, in-the-moment stamp -- wrong tool for a
 * backfill of a real PAST timestamp), and deliberately does NOT invoke
 * mintProformaInvoiceOnFirstPickup or any other real-time side effect that assumes the event is
 * happening now. Any first-pickup financial side effect this stop's real-time stamp would normally
 * have triggered is explicitly NOT run here and is flagged in REMAINING for human review through
 * the normal service path if still applicable.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const STOP_ID = "005d414c-66ba-484d-bc0a-1d99e0be8fe6"; // load 13637, pickup, Wilkes-Barre PA
const LOAD_ID = "cb00b8e8-3aa9-4445-9cf5-0010640eb033"; // load 13637
const ARRIVAL_AT = "2026-09-28T17:35:04.000Z"; // first real GPS ping within ~293 ft of the stop
const DEPARTURE_AT = "2026-09-28T18:35:14.000Z"; // last real GPS ping still within ~293-311 ft, immediately before the monotonic departure

const auth = process.env.OWNER_AUTH_ID;
if (!auth) {
  console.error("OWNER_AUTH_ID required");
  process.exit(1);
}
execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("BEGIN");
await client.query("SET LOCAL app.bypass_rls = 'lucia'");
try {
  const before = (
    await client.query(
      `SELECT id, load_id, stop_type, actual_arrival_at, actual_departure_at, actual_arrival_source
         FROM mdata.load_stops
        WHERE id = $1::uuid AND load_id = $2::uuid AND soft_deleted_at IS NULL`,
      [STOP_ID, LOAD_ID]
    )
  ).rows[0];
  if (!before) throw new Error(`stop ${STOP_ID} on load ${LOAD_ID} not found -- refusing, data has moved since this script was written`);
  if (before.actual_arrival_at !== null || before.actual_departure_at !== null) {
    throw new Error(
      `stop ${STOP_ID}: expected both actual_arrival_at and actual_departure_at NULL, found arrival=${before.actual_arrival_at} departure=${before.actual_departure_at} -- refusing, state has moved since this script was written`
    );
  }

  const updated = await client.query(
    `UPDATE mdata.load_stops
        SET actual_arrival_at = $2::timestamptz,
            actual_departure_at = $3::timestamptz,
            actual_arrival_source = 'eld_geofence'
      WHERE id = $1::uuid AND load_id = $4::uuid
      RETURNING id, actual_arrival_at, actual_departure_at, actual_arrival_source`,
    [STOP_ID, ARRIVAL_AT, DEPARTURE_AT, LOAD_ID]
  );
  if (!updated.rows[0]) throw new Error("update affected 0 rows");

  await client.query(
    `INSERT INTO audit.audit_events (uuid, created_at, event_class, severity, payload, actor_user_uuid, source)
     VALUES (gen_random_uuid(), now(), 'dispatch.load_stop.stamp_backfilled', 'info', $1::jsonb, $2, 'AUTH-152-manual-backfill')`,
    [
      JSON.stringify({
        load_id: LOAD_ID,
        load_number: "13637",
        stop_id: STOP_ID,
        stop_type: "pickup",
        actual_arrival_at: ARRIVAL_AT,
        actual_departure_at: DEPARTURE_AT,
        actual_arrival_source: "eld_geofence",
        reason:
          "AUTH-152: backfilled from real telematics.vehicle_locations GPS convergence at the stop's own geocoded coordinates (2026-09-28 17:35:04Z-18:35:14Z, ~293-311 ft), no fabricated timestamp",
      }),
      "e4117991-d2c0-406d-8cda-74e98d95bccd",
    ]
  );

  await client.query("COMMIT");
  console.log(
    JSON.stringify(
      {
        result: "COMMITTED",
        stamped: updated.rows[0],
        not_backfilled_no_real_event: {
          "13630": "unit T164 closest GPS approach to pickup coords = 5,963 ft (~1.1 mi), left NULL",
          "13634": "unit T152 closest GPS approach to pickup coords = 172,982 ft (~32.8 mi), left NULL",
          "13635": "unit T148 closest GPS approach to pickup coords = 5,438,523 ft (~1,030 mi), left NULL",
        },
      },
      null,
      2
    )
  );
} catch (err) {
  await client.query("ROLLBACK");
  console.log(JSON.stringify({ result: "FAILED — rolled back: " + (err as Error).message }));
  process.exitCode = 1;
} finally {
  await client.end();
}
