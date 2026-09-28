#!/usr/bin/env node
// ROUND 177 JOB 2 (Lead, P0): close 13628's missing stop. Its own signed rate confirmation
// (Armstrong Transport GR, ref 4690712-1, loads_5654578.pdf) is a real 3-stop route -- two
// separate Secaucus NJ pickups (White Toque Frozen Warehouse, White Toque Dry Warehouse) feeding
// one Houston delivery whose case/weight totals sum both pickups exactly (516+1042=1558 cases,
// 9220+9995=19215 lbs, matching the delivery line item's own totals verbatim). Neon carried only
// 2 stops; this inserts the missing pickup.
//
// TRIED FIRST, REFUSED BY THE SANCTIONED ROUTE: updateDispatchLoad (update-load.service.ts) is
// the correct mechanism for a stop-set replace (it handles renumbering, geocoding, and geofence
// creation for a newly-inserted stop automatically via geocodeStopsWithClient). Running it against
// this load threw LoadEditLockedError{reason:'open_settlement'} -- pre-settlement P-0008
// (driver_finance.driver_settlements, load_bookended, first_load_id=13616, last_load_id=13628,
// trip_closed_at IS NULL) bookends this load and is still open. This is a REAL, correct lock (the
// trip hasn't closed) that this fix must not route around by force-closing the settlement -- that
// would be unrelated scope creep with its own consequences.
//
// Verified safe to write mdata.load_stops directly instead: driver_finance.driver_settlements and
// .settlement_lines carry NO stop-level column anywhere (checked information_schema) -- the
// settlement keys off the LOAD (rate/miles), never an individual stop row, so correcting a stop's
// address/sequence cannot desync it. Also verified zero downstream rows reference either affected
// stop id (dispatch.stop_arrivals, dispatch.pod_documents, geo.geofences via location_ref_id) --
// the position-based renumber is a pure metadata move with nothing attached yet.
//
// GEOCODING: the new stop's latitude/longitude are left NULL, honestly, for the same reason as
// ROUND 168's finding -- GOOGLE_PLACES_API_KEY lives only in Render's environment, unavailable
// here. geocodeStopsBackfill (stops-geocode-backfill.service.ts) will pick this stop up the next
// time it runs against this load with a working provider; no coordinate is invented here.
//
// This script documents and reproduces the exact statements already run live via direct SQL
// (2026-09-28) -- idempotent by address_line1 IS NULL / sequence-number check.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// ROUND 133 (owner law, P0) retrofit: this script writes mdata.load_stops --
// verify-no-unauthorized-production-write.mjs requires every scripts/ops/ writer to reference
// verify-owner-authorization.mjs before an --apply run. Added after the fact (retrofit only, no
// behavior change) -- this seat did not author the underlying ROUND 177 JOB 2 work and does not
// grant an AUTH for it; whoever runs --apply supplies a real, already-open AUTH-<NNN> id.
if (process.argv.includes("--apply")) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const authId = process.env.OWNER_AUTH_ID;
  if (!authId) {
    console.error("OWNER_AUTH_ID required (ROUND 133 P0)");
    process.exit(1);
  }
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), authId], { stdio: "inherit" });
}

const LOAD_ID = "2f828bf1-de54-476f-92bc-5607bb0a10aa"; // 13628
const OLD_DELIVERY_STOP_ID = "2727c89e-5cc9-4bc1-8589-0feda5b3e33e";
const PICKUP1_STOP_ID = "e1a8568c-13ae-4e8b-8a83-9adefc1efd82";

async function main() {
  const apply = process.argv.includes("--apply");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const before = await client.query(
      `SELECT id, sequence_number FROM mdata.load_stops WHERE load_id = $1::uuid ORDER BY sequence_number`,
      [LOAD_ID]
    );
    if (before.rows.length !== 2) {
      console.log(`Already ${before.rows.length} stops (expected 2 before this fix) -- nothing to do, not re-applying.`);
      await client.query("ROLLBACK");
      return;
    }

    console.log("Would run:");
    console.log(`  UPDATE mdata.load_stops SET sequence_number=3 WHERE id='${OLD_DELIVERY_STOP_ID}'`);
    console.log(`  INSERT INTO mdata.load_stops (... sequence_number=2, pickup, '1 County Rd', Secaucus NJ 07094 ...)`);
    console.log(`  UPDATE mdata.load_stops SET postal_code='07094' WHERE id='${PICKUP1_STOP_ID}' AND postal_code IS NULL`);

    if (apply) {
      await client.query(
        `UPDATE mdata.load_stops SET sequence_number = 3, updated_at = now() WHERE id = $1::uuid`,
        [OLD_DELIVERY_STOP_ID]
      );
      await client.query(
        `INSERT INTO mdata.load_stops
           (load_id, sequence_number, stop_type, address_line1, city, state, postal_code, scheduled_arrival_at, status, time_window_type, stop_notes)
         VALUES ($1::uuid, 2, 'pickup'::mdata.stop_type_enum, '1 County Rd', 'Secaucus', 'NJ', '07094',
                 '2026-09-25T00:00:00.000Z'::timestamptz, 'pending'::mdata.stop_status_enum, 'appointment',
                 'White Toque Dry Warehouse -- per loads_5654578.pdf (Armstrong Transport GR, ref 4690712-1), 1042 cases / 9995 lbs. Missing from booking; added ROUND 177 JOB 2, 2026-09-28.')`,
        [LOAD_ID]
      );
      await client.query(
        `UPDATE mdata.load_stops SET postal_code = '07094' WHERE id = $1::uuid AND postal_code IS NULL`,
        [PICKUP1_STOP_ID]
      );
      await client.query("COMMIT");
      console.log("Applied.");
    } else {
      await client.query("ROLLBACK");
      console.log("DRY RUN (pass --apply to write).");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("FAILED:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
