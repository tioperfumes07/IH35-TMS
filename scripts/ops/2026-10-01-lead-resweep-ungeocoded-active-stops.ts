/**
 * Lead 2026-10-01 — re-sweep every active USMCA load with an un-geocoded or un-fenced stop through the production code path
 * (geocodeStopsWithClient, now savepoint-safe), exactly what the E-25 sync cron does on every
 * tick after the next deploy. Run now so the live guard (verify-stops-geocoded --live) carries
 * evidence instead of two unexplained NULLs. Actor = the load's booked_by_user_id (real attribution).
 *
 * Dry run (rolled back):  DATABASE_URL=<prod> GOOGLE_PLACES_API_KEY=… GOOGLE_PLACES_ENABLED=true npx tsx scripts/ops/2026-10-01-lead-geocode-13593-stops.ts
 * Apply:                  … --apply
 */
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";
import { resweepUngeocodedActiveStops } from "../../apps/backend/src/telematics/load-stop-geofence-sync.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    if (APPLY) await assertIsIntendedProduction(client, { label: "lead-geocode-13593" });
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner"); // NEONDB-OWNER-OK: ops script, owner-directed, writes the engine's own output
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
    const before = await client.query(`SELECT l.load_number, s.id, s.city, s.state, s.latitude, s.longitude, s.geocode_precision, s.location_id,
        (SELECT count(*) FROM geo.geofences g WHERE g.location_ref_id=s.location_id AND g.is_active) AS fences
       FROM mdata.load_stops s JOIN mdata.loads l ON l.id=s.load_id
      WHERE l.operating_company_id=$1::uuid AND l.soft_deleted_at IS NULL AND l.status NOT IN ('cancelled','delivered') AND s.soft_deleted_at IS NULL
        AND (s.latitude IS NULL OR (s.location_id IS NOT NULL AND coalesce(s.geocode_precision,'rooftop') <> 'locality'
             AND NOT EXISTS (SELECT 1 FROM geo.geofences g WHERE g.location_ref_id=s.location_id AND g.is_active)))`, [USMCA]);
    console.log("BEFORE", before.rows);
    const result = await resweepUngeocodedActiveStops(client as never, USMCA);
    console.log("RESULT", result);
    const after = await client.query(`SELECT l.load_number, s.id, s.latitude, s.longitude, s.geocode_precision, s.geocode_source, s.geocode_failure_reason,
        (SELECT count(*) FROM geo.geofences g WHERE g.location_ref_id=s.location_id AND g.is_active) AS fences
       FROM mdata.load_stops s JOIN mdata.loads l ON l.id=s.load_id WHERE s.id = ANY($1::uuid[]) ORDER BY l.load_number`, [before.rows.map((r: { id: string }) => r.id)]);
    console.log("AFTER", after.rows);
    if (APPLY) {
      await client.query(
        `INSERT INTO audit.audit_events (uuid, created_at, event_class, severity, payload, actor_user_uuid, source)
         VALUES (gen_random_uuid(), now(), 'telematics.stops_resweep_by_lead_ops', 'info', $1::jsonb, NULL, 'LEAD-2026-10-01-RESWEEP-STOPS')`,
        [JSON.stringify({ result, before: before.rows, after: after.rows, reason: "same re-sweep the E-25 cron runs each tick; run once by the Lead so the live guard carries evidence before deploy" })],
      );
      await client.query("COMMIT");
      console.log("COMMITTED");
    } else {
      await client.query("ROLLBACK");
      console.log("DRY RUN — rolled back");
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
