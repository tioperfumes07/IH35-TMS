#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const canonical = {
  service: read("apps/backend/src/telematics/stops-geocode-backfill.service.ts"),
  route: read("apps/backend/src/telematics/stops-geocode-backfill.routes.ts"),
  index: read("apps/backend/src/index.ts"),
  book: read("apps/backend/src/dispatch/book-load.service.ts"),
  edit: read("apps/backend/src/dispatch/update-load.service.ts"),
  migration: read("db/migrations/202613772300_tel40_stop_geocode_evidence_and_radii.sql"),
  step: read("scripts/verify-steps/3334-verify-codex-vertical-nonmoney-zero-remainder.mjs"),
};
export function failures(files = canonical) {
  const out = [];
  if (!files.service.includes("geocodeAddressWithEvidence") || !files.service.includes("geocode_failure_reason")) out.push("durable evidence/failure reason missing");
  if (!files.service.includes("mdata.locations") || !files.service.includes("location_ref_id=$3::uuid") || !files.service.includes("pg_advisory_xact_lock")) out.push("race-safe location dedupe/link missing");
  if (!files.service.includes("ENTER_RADIUS_M = 402") || !files.service.includes("EXIT_RADIUS_M = 805")) out.push("0.25/0.5 mile radii missing");
  if (!files.service.includes("location_latitude != null") || !files.service.includes('source: "location_existing"')) out.push("linked canonical location coordinates must precede provider fallback");
  if (files.service.includes("samsara.create_geofence") || files.service.includes("/places")) out.push("Samsara place push forbidden");
  if (!files.route.includes('/api/v1/telematics/stops/geocode-backfill') || !files.route.includes('user.role !== "Owner"')) out.push("admin route missing");
  if (!files.index.includes("registerStopsGeocodeBackfillRoutes(app)")) out.push("route unmounted");
  if (!files.book.includes("geocodeStopsBackfill") || !files.edit.includes("await geocodeStopsWithClient")) out.push("new-stop service hooks missing");
  if (!files.migration.includes("load_stops_coordinates_not_zero_check") || !files.migration.includes("latitude <> 0 OR longitude <> 0") || !files.migration.includes("enter_radius_m") || !files.migration.includes("exit_radius_m")) out.push("schema constraints missing");
  if (!files.step.includes("verify-stops-geocoded.mjs")) out.push("CI registration missing");
  return out;
}
async function live() {
  const pg = await import("pg");
  const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const { rows: [row] } = await client.query(`WITH b AS (SELECT set_config('app.bypass_rls','lucia',false)), active_stops AS (
      SELECT s.* FROM b, mdata.load_stops s JOIN mdata.loads l ON l.id=s.load_id
       WHERE l.operating_company_id=$1::uuid AND l.soft_deleted_at IS NULL
         AND l.status NOT IN ('cancelled','delivered') AND s.soft_deleted_at IS NULL)
      SELECT count(*) FILTER (WHERE (latitude IS NULL OR longitude IS NULL) AND geocode_failure_reason IS NULL)::int unexplained_null,
             count(*) FILTER (WHERE latitude=0 AND longitude=0)::int zero_zero,
             count(DISTINCT location_id) FILTER (WHERE location_id IS NOT NULL)::int locations,
             (SELECT count(*)::int FROM b, geo.geofences g WHERE g.operating_company_id=$1::uuid AND g.is_active
                AND g.location_ref_id IN (SELECT location_id FROM active_stops WHERE location_id IS NOT NULL)) geofences
        FROM active_stops`, ["5c854333-6ea5-4faa-af31-67cb272fef80"]);
    await client.query("ROLLBACK");
    if (row.unexplained_null !== 0 || row.zero_zero !== 0 || row.geofences < row.locations) throw new Error(`live incomplete ${JSON.stringify(row)}`);
    console.log(`PASS verify-stops-geocoded live null=${row.unexplained_null} zero_zero=${row.zero_zero} geofences=${row.geofences} locations=${row.locations}`);
  } finally { client.release(); await pool.end(); }
}
if (process.argv.includes("--selftest")) {
  const plants = [
    { ...canonical, migration: canonical.migration.replace("latitude <> 0 OR longitude <> 0", "TRUE") },
    { ...canonical, service: canonical.service.replace("ENTER_RADIUS_M = 402", "ENTER_RADIUS_M = 0") },
    { ...canonical, route: canonical.route.replace("/api/v1/telematics/stops/geocode-backfill", "/missing") },
    { ...canonical, edit: canonical.edit.replace("await geocodeStopsWithClient", "void geocodeStopsWithClient") },
    { ...canonical, service: canonical.service.replace("location_latitude != null", "location_latitude == null") },
  ];
  for (const plant of plants) if (failures(plant).length === 0) throw new Error("planted regression escaped");
  console.log(`PASS verify-stops-geocoded --selftest ${plants.length}/${plants.length}`);
}
const staticFailures = failures();
if (staticFailures.length) { staticFailures.forEach((x) => console.error(`FAIL ${x}`)); process.exit(1); }
console.log("PASS verify-stops-geocoded static 9/9");
if (process.argv.includes("--live")) await live();
