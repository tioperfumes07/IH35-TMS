/**
 * 443.260 REPAIR — re-flag Edison NJ range-geocode stops for loads 13692/13693/13695
 *
 * ROOT CAUSE: 980 New Durham Rd, Edison NJ geocodes with precision='range' (Google returns a
 * street-range interpolation 0.7mi from the actual dock). The backfill engine previously created
 * a geofence at the imprecise pin, so GPS pings inside the real 0.25mi fence never counted.
 * Three deliveries were made but never stamped, leaving $14,700 uninvoiced.
 *
 * FIX: Clear location_id + set geocode_failure_reason='range_imprecise_no_fence' so the
 * GPS-dwell engine picks up the next actual dwell and creates a verified fence from real data.
 *
 * AUTHORIZATION: Owner — row 260 of GO-23 (2026-11-02)
 * RUN: node --loader ts-node/esm scripts/ops/2026-11-02-repair-range-geocode-edison-nj-loads-260.ts
 */

import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.js";

const auth = "443.260 — Owner row 260 of GO-23 (2026-11-02): repair Edison NJ range-geocode stops for loads 13692/13693/13695";
execFileSync("node", ["scripts/verify-owner-authorization.mjs", auth]);

const LOAD_DISPLAY_IDS = ["13692", "13693", "13695"];
const ACTOR_ID = "00000000-0000-0000-0000-000000000001"; // system actor for repair scripts

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set — use node --env-file=.env");

  const pool = new Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL app.bypass_rls = 'on'`);

    // Find stops for these loads by display_id
    const loads = await client.query<{ id: string; display_id: string }>(`
      SELECT id, display_id FROM mdata.loads
      WHERE display_id = ANY($1::text[])
        AND is_sample_data IS NOT TRUE
    `, [LOAD_DISPLAY_IDS]);

    if (loads.rows.length === 0) {
      console.log("No loads found for display IDs:", LOAD_DISPLAY_IDS, "— nothing to repair");
      await client.query("ROLLBACK");
      return;
    }
    console.log(`Found ${loads.rows.length} loads:`, loads.rows.map(r => r.display_id));

    const loadIds = loads.rows.map(r => r.id);

    // Find delivery stops at Edison NJ (range geocode, location_id currently set or not)
    const stops = await client.query<{ id: string; load_id: string; geocode_precision: string; location_id: string | null; address: string }>(`
      SELECT ls.id, ls.load_id, ls.geocode_precision, ls.location_id,
             coalesce(ls.address_line1, '') || ', ' || coalesce(ls.city, '') || ' ' || coalesce(ls.state, '') AS address
      FROM mdata.load_stops ls
      WHERE ls.load_id = ANY($1::uuid[])
        AND ls.stop_type IN ('delivery','unload')
    `, [loadIds]);

    console.log(`Found ${stops.rows.length} delivery stops`);
    for (const s of stops.rows) {
      console.log(`  stop ${s.id}: precision=${s.geocode_precision}, location_id=${s.location_id}, addr=${s.address}`);
    }

    // Clear location_id and set failure_reason for range-precision stops
    const rangeStops = stops.rows.filter(s => s.geocode_precision === "range" || s.location_id !== null);
    if (rangeStops.length === 0) {
      console.log("No range-precision stops found — already repaired or different precision");
    }

    for (const stop of rangeStops) {
      const updated = await client.query<{ id: string }>(`
        UPDATE mdata.load_stops SET
          location_id = NULL,
          geocode_precision = 'range',
          geocode_failure_reason = 'range_imprecise_no_fence',
          updated_at = now()
        WHERE id = $1::uuid
        RETURNING id::text
      `, [stop.id]);
      if (updated.rows[0]) {
        console.log(`  REPAIRED stop ${stop.id}`);
        await appendCrudAudit(client as never, ACTOR_ID, "dispatch.load_stop.range_geocode_repair_260", {
          resource_type: "mdata.load_stops",
          resource_id: stop.id,
          load_id: stop.load_id,
          previous_location_id: stop.location_id,
          reason: "443.260: Edison NJ 980 New Durham Rd range-geocode repair — cleared imprecise fence link",
        }, "warning", "443.260");
      }
    }

    await client.query("COMMIT");
    console.log("COMMIT OK — GPS-dwell engine will create verified fences on next truck dwell");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
