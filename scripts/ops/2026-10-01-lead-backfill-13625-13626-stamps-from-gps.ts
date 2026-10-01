#!/usr/bin/env npx tsx
/**
 * 2026-10-01 (Lead) — backfill REAL, already-occurred stop arrivals on loads 13625 / 13626 from
 * telematics.vehicle_locations (raw Samsara GPS, never synthetic), under the owner's standing
 * DISPATCH-STAMPS order (AUTH-152 wording): "Backfill them from the real geofence events; where
 * no event exists, leave NULL and report the count -- never invent a timestamp."
 *
 * WHY THESE TWO: both loads were entered 2026-09-28 for pickups scheduled 2026-09-24, so the live
 * geofence detector (forward-only, fires on fresh positions) could never stamp them; CC-2 removed
 * the fabricated delivery stamps under AUTH-172 (correct); verify-dispatched-load-has-stop-stamps
 * now fails every migration PR on exactly these two. The permanent fix is the retro-arrival engine
 * (registry E-25, Lead): this script is the one-time, evidence-only repair for the two loads that
 * pre-date it.
 *
 * MEASURED LIVE 2026-10-01 (USMCA 5c854333-6ea5-4faa-af31-67cb272fef80), each from the assigned
 * unit's own GPS fixes against the stop's coordinates:
 *   13625 pickup  GPEX Yard, 14411 Import Rd, Laredo TX 78045 — stop was geocoded to a LOCALITY
 *                 centroid (nominatim) 9 mi south of the real address. US Census geocoder resolves
 *                 "14411 IMPORT RD, LAREDO, TX, 78045" to 27.624523712429, -99.535908573934.
 *                 T148: 72 fixes inside 300 m of that point, 68 of them stopped, 160–255 m,
 *                 2026-09-24 15:29:56Z → 18:20:14Z, then a monotonic run north toward PA.
 *   13626 pickup  Newcold, 904 Edwards Dr, Lebanon IN (rooftop). T156: dwell at ~321 m,
 *                 2026-09-24 16:45:45Z → 17:00:10Z (12 fixes inside ~0.02°, closest 321 m).
 *                 Large cold-storage site; the dock is not at the rooftop pin.
 *   13626 delivery Walmart 6858, Mebane NC (rooftop, confidence 0.95). T156: 126 fixes inside
 *                 300 m, 124 stopped, 89–295 m, 2026-09-25 18:54:59Z → 2026-09-26 00:10:03Z.
 *   13625 delivery Nestle, Breinigsville PA — T148 has NEVER been inside ~1.4 mi of the pin since
 *                 2026-09-23. NO EVENT. Left NULL, reported.
 *
 * WRITES (and nothing else): the three stops' actual_arrival_at / actual_departure_at /
 * actual_arrival_source='eld_geofence' (honest: ELD/GPS-position-derived, computed retroactively
 * from the same feed the live detector reads); and 13625 pickup's latitude/longitude/
 * geocode_source/geocode_precision/geocode_confidence to the Census rooftop so the stop stops
 * lying about where the yard is. Does NOT touch mdata.loads.status, does NOT call
 * stampStopArrival/stampStopDeparture (both stamp now()), does NOT run any first-pickup money
 * side effect. One audit.audit_events row per write.
 *
 * Run (dry run, rolled back):  DATABASE_URL=<prod> npx tsx scripts/ops/2026-10-01-lead-backfill-13625-13626-stamps-from-gps.ts
 * Apply:                        OWNER_AUTH_ID=AUTH-<n> DATABASE_URL=<prod> npx tsx ... --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertNotProduction, assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const CENSUS_LAT = 27.624523712429;
const CENSUS_LNG = -99.535908573934;

const STAMPS = [
  {
    loadNumber: "13625", loadId: "84e7bdd4-77dc-473d-af05-64acf13a8246",
    stopId: "6de58e1c-2b89-4be3-b955-a82020c8fb16", stopType: "pickup",
    arrival: "2026-09-24T15:29:56.000Z", departure: "2026-09-24T18:20:14.000Z",
    evidence: "T148: 72 fixes <300 m of 14411 Import Rd (Census rooftop), 68 stopped, 160-255 m",
    regeocode: true,
  },
  {
    loadNumber: "13626", loadId: "6fd1fa73-2b8b-47db-9806-cdda6e67e214",
    stopId: "a1f50f4e-98b5-4458-a4b4-63c8ab285025", stopType: "pickup",
    arrival: "2026-09-24T16:45:45.000Z", departure: "2026-09-24T17:00:10.000Z",
    evidence: "T156: dwell at ~321 m from Newcold rooftop pin, 12 fixes, large cold-storage site",
    regeocode: false,
  },
  {
    loadNumber: "13626", loadId: "6fd1fa73-2b8b-47db-9806-cdda6e67e214",
    stopId: "737a0781-5241-4264-b973-6bc3fcbc823f", stopType: "delivery",
    arrival: "2026-09-25T18:54:59.000Z", departure: "2026-09-26T00:10:03.000Z",
    evidence: "T156: 126 fixes <300 m of Walmart 6858 rooftop, 124 stopped, 89-295 m",
    regeocode: false,
  },
] as const;

const NOT_BACKFILLED = {
  "13625 delivery (Nestle, Breinigsville PA, stop 8b6132da-be36-45f5-b43f-be06df03a82c)":
    "T148 never inside ~1.4 mi of the pin since 2026-09-23 — no real event, left NULL",
};

const auth = process.env.OWNER_AUTH_ID;
if (APPLY) {
  if (!auth) { console.error("OWNER_AUTH_ID required for --apply"); process.exit(1); }
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await (APPLY ? assertIsIntendedProduction : assertNotProduction)(client, {
  label: "scripts/ops/2026-10-01-lead-backfill-13625-13626-stamps-from-gps.ts",
});
await client.query("BEGIN");
await client.query("SET LOCAL app.bypass_rls = 'lucia'");
try {
  const results: Record<string, unknown>[] = [];
  for (const s of STAMPS) {
    const before = (
      await client.query(
        `SELECT id, stop_type, actual_arrival_at, actual_departure_at, latitude, longitude, geocode_source
           FROM mdata.load_stops
          WHERE id = $1::uuid AND load_id = $2::uuid AND soft_deleted_at IS NULL`,
        [s.stopId, s.loadId]
      )
    ).rows[0];
    if (!before) throw new Error(`stop ${s.stopId} on load ${s.loadNumber} not found -- refusing, data has moved`);
    if (before.stop_type !== s.stopType) throw new Error(`stop ${s.stopId} is ${before.stop_type}, expected ${s.stopType}`);
    if (before.actual_arrival_at !== null || before.actual_departure_at !== null) {
      throw new Error(`stop ${s.stopId}: expected NULL stamps, found arrival=${before.actual_arrival_at} departure=${before.actual_departure_at} -- refusing`);
    }
    // Re-measure the evidence inside the same transaction: the stamps must still be backed by fixes.
    const lat = s.regeocode ? CENSUS_LAT : Number(before.latitude);
    const lng = s.regeocode ? CENSUS_LNG : Number(before.longitude);
    const radiusM = s.loadNumber === "13626" && s.stopType === "pickup" ? 400 : 300;
    const ev = (
      await client.query(
        `SELECT count(*)::int AS fixes, min(v.captured_at) AS first_fix, max(v.captured_at) AS last_fix
           FROM telematics.vehicle_locations v
           JOIN mdata.loads l ON l.assigned_unit_id = v.unit_id
          WHERE l.id = $1::uuid
            AND v.captured_at BETWEEN $2::timestamptz - interval '1 minute' AND $3::timestamptz + interval '1 minute'
            AND v.lat BETWEEN $4 - 0.01 AND $4 + 0.01 AND v.lng BETWEEN $5 - 0.01 AND $5 + 0.01
            AND 2*6371000*asin(sqrt(sin(radians(v.lat-$4)/2)^2 + cos(radians($4))*cos(radians(v.lat))*sin(radians(v.lng-$5)/2)^2)) < $6`,
        [s.loadId, s.arrival, s.departure, lat, lng, radiusM]
      )
    ).rows[0];
    if (ev.fixes < 4) throw new Error(`stop ${s.stopId}: only ${ev.fixes} GPS fixes inside ${radiusM} m in the window -- evidence gone, refusing`);

    if (s.regeocode) {
      await client.query(
        `UPDATE mdata.load_stops
            SET latitude = $2, longitude = $3, geocode_source = 'us_census_geocoder',
                geocode_precision = 'rooftop', geocode_confidence = 0.9, geocode_attempted_at = now(),
                geocode_failure_reason = NULL
          WHERE id = $1::uuid`,
        [s.stopId, CENSUS_LAT, CENSUS_LNG]
      );
      await client.query(
        `INSERT INTO audit.audit_events (uuid, created_at, event_class, severity, payload, actor_user_uuid, source)
         VALUES (gen_random_uuid(), now(), 'dispatch.load_stop.geocode_corrected', 'info', $1::jsonb, $2, $3)`,
        [JSON.stringify({ load_id: s.loadId, load_number: s.loadNumber, stop_id: s.stopId,
          from: { latitude: before.latitude, longitude: before.longitude, geocode_source: before.geocode_source },
          to: { latitude: CENSUS_LAT, longitude: CENSUS_LNG, geocode_source: "us_census_geocoder", geocode_precision: "rooftop" },
          reason: "nominatim locality centroid was 9 mi from 14411 Import Rd; US Census geocoder rooftop match; T148 GPS dwell confirms" }),
         ACTOR_USER_ID, `${auth ?? "DRY-RUN"}-lead-backfill`]
      );
    }

    const upd = await client.query(
      `UPDATE mdata.load_stops
          SET actual_arrival_at = $2::timestamptz, actual_departure_at = $3::timestamptz, actual_arrival_source = 'eld_geofence'
        WHERE id = $1::uuid
        RETURNING id, actual_arrival_at, actual_departure_at, actual_arrival_source`,
      [s.stopId, s.arrival, s.departure]
    );
    await client.query(
      `INSERT INTO audit.audit_events (uuid, created_at, event_class, severity, payload, actor_user_uuid, source)
       VALUES (gen_random_uuid(), now(), 'dispatch.load_stop.stamp_backfilled', 'info', $1::jsonb, $2, $3)`,
      [JSON.stringify({ load_id: s.loadId, load_number: s.loadNumber, stop_id: s.stopId, stop_type: s.stopType,
        actual_arrival_at: s.arrival, actual_departure_at: s.departure, actual_arrival_source: "eld_geofence",
        evidence: s.evidence, remeasured: ev, reason: `${auth ?? "DRY-RUN"}: backfilled from real telematics.vehicle_locations GPS dwell at the stop; no fabricated timestamp` }),
       ACTOR_USER_ID, `${auth ?? "DRY-RUN"}-lead-backfill`]
    );
    results.push({ load: s.loadNumber, stop_type: s.stopType, ...upd.rows[0], remeasured: ev });
  }

  if (APPLY) {
    await client.query("COMMIT");
  } else {
    await client.query("ROLLBACK");
  }
  console.log(JSON.stringify({ result: APPLY ? "COMMITTED" : "DRY RUN — rolled back", stamped: results, not_backfilled_no_real_event: NOT_BACKFILLED }, null, 2));
} catch (err) {
  await client.query("ROLLBACK");
  console.log(JSON.stringify({ result: "FAILED — rolled back: " + (err as Error).message }));
  process.exitCode = 1;
} finally {
  await client.end();
}
