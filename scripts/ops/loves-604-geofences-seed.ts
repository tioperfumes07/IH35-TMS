#!/usr/bin/env tsx
// LOVE'S 604 GEOFENCES (Lead, 2026-09-23, Round 33.1) -- the 2026-09-05 LOVES-604 geofence box was
// never built (geo.geofences = 7 rows total across ALL companies, zero Love's). Seeds both halves
// from the owner-verified extract (~/Downloads/09-22-2026-LOVES-604-GEOFENCE-SEED.csv, 604 unique
// stores / 0 rejected / 42 states / every row a valid lat/lng, per the Lead's own live check).
//
// LOCATION_TYPE = 'fuel_stop', not 'truck_stop' -- both are in the mdata.location_type_enum, and
// this is not a guess: live-confirmed the codebase ALREADY classifies Love's this way ("Loves
// Laredo" rows already exist as location_type='fuel_stop'; the separate "TA Laredo" chain is the
// one already carrying 'truck_stop'). Matching existing precedent, not picking a fresh answer.
//
// RADIUS -- proposed, not inherited. geo.geofences' own column defaults (enter_radius_m=402,
// exit_radius_m=805, ~1/4mi and ~1/2mi) are tuned for a customer dock, which the Lead explicitly
// warned this is not. A Love's Travel Stop is a large highway-frontage parcel (fuel islands, a
// truck parking field of 50-100+ spots, the store/restaurant building) -- reasoned from that real
// footprint, not the dock default: radius_m/enter_radius_m = 200m (captures fuel islands + the
// truck lot from a single center point without commonly reaching a separate business across a
// highway) and exit_radius_m = 350m (a wider hysteresis band so a truck idling near the property
// edge doesn't flicker enter/exit, while staying well short of the next highway exit's own stop).
// If a specific store's real footprint proves larger/smaller once arrival data exists, these are a
// single column update per row, not a re-seed.
//
// geo.geofences.source='loves_import' and location_kind='fuel_stop' -- NOT guessed: live-read the
// table's own CHECK constraints (geo_geofences_source_check, geo_geofences_location_kind_check)
// and both values are ALREADY in the allowed set, unused by any live row -- someone anticipated
// this exact import at the schema level (consistent with the Lead's own "17 days old, never
// built" note) and this script is the first real use of either.
//
// vertices_json -- reuses circleToPolygonVertices() verbatim (ORDER-2026-09-04-CC-3-SAMSARA-
// GEOFENCE-IMPORT's own circle-to-polygon helper), the SAME function address-import.service.ts
// already uses for Samsara-imported circle geofences. No new geometry math.
//
// IDEMPOTENT: mdata.locations upserts on location_code (globally unique, LOVES-<store_no>);
// geo.geofences upserts on the real (operating_company_id, external_source, external_ref) unique
// index every other external-sourced geofence in this codebase already uses. Re-running this script
// updates the same 604+604 rows, never duplicates them.
//
// is_sample_data = FALSE throughout -- these are real network locations, not test fixtures. Nothing
// is deleted; a store leaving the network is a future DEACTIVATE (deactivated_at / is_active=false),
// not a delete, matching void-not-delete.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { circleToPolygonVertices } from "../../apps/backend/src/integrations/samsara/geofences/circle-to-polygon.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const SEED_CSV = path.join(process.env.HOME!, "Downloads/09-22-2026-LOVES-604-GEOFENCE-SEED.csv");

const RADIUS_M = 200;
const ENTER_RADIUS_M = 200;
const EXIT_RADIUS_M = 350;

// RFC-4180-ish CSV parser (quoted fields, embedded commas) -- same shape as
// integrations/relay-payments/relay-fuel-csv-import.routes.ts's own parseCsv, reused verbatim
// because this seed's google_maps_link column embeds a comma inside its quoted value
// ("https://www.google.com/maps?q=30.654400,-87.759400") that a naive split(",") corrupts.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!,
      n = text[i + 1];
    if (inQ) {
      if (c === '"' && n === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      /* skip */
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r[0] ?? "").trim().length > 0);
}

type StoreRow = {
  store_no: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  effective_date: string;
};

function loadStores(): StoreRow[] {
  const text = fs.readFileSync(SEED_CSV, "utf8");
  const rows = parseCsv(text);
  const header = rows[0]!;
  const idx = (name: string) => header.indexOf(name);
  const iStore = idx("store_no"),
    iCity = idx("city"),
    iState = idx("state"),
    iLat = idx("latitude"),
    iLng = idx("longitude"),
    iEff = idx("effective_date");
  return rows.slice(1).map((r) => ({
    store_no: r[iStore]!.trim(),
    city: r[iCity]!.trim(),
    state: r[iState]!.trim(),
    latitude: Number(r[iLat]),
    longitude: Number(r[iLng]),
    effective_date: r[iEff]!.trim(),
  }));
}

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("ABORT: DATABASE_URL required.");
  if (/-pooler\./.test(url)) throw new Error("REFUSING pooler endpoint.");

  const stores = loadStores();
  const rejected = stores.filter(
    (s) => !s.store_no || !Number.isFinite(s.latitude) || !Number.isFinite(s.longitude)
  );
  console.log(`Parsed ${stores.length} stores from ${SEED_CSV} (${rejected.length} rejected for missing store_no/lat/lng).`);
  const duplicates = stores.length - new Set(stores.map((s) => s.store_no)).size;
  console.log(`Duplicate store_no values: ${duplicates}.`);
  const states = new Set(stores.map((s) => s.state));
  console.log(`Distinct states: ${states.size}.`);

  if (!executeFlag) {
    console.log("\nDRY RUN -- no writes made. Re-run with --execute to apply.");
    return;
  }

  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await client.query("RESET ROLE");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

  let locationsUpserted = 0;
  let geofencesUpserted = 0;
  for (const s of stores) {
    if (rejected.includes(s)) continue;
    const locationCode = `LOVES-${s.store_no}`;
    const locationName = `Love's #${s.store_no} — ${s.city}, ${s.state}`;
    const locRes = await client.query<{ id: string }>(
      `
        INSERT INTO mdata.locations (
          operating_company_id, location_name, location_code, location_type,
          city, state, country, latitude, longitude,
          geocoded_at, geocoding_source, is_sample_data,
          created_by_user_id, updated_by_user_id
        ) VALUES (
          $1::uuid, $2, $3, 'fuel_stop',
          $4, $5, 'US', $6, $7,
          now(), $8, false,
          $9::uuid, $9::uuid
        )
        ON CONFLICT (location_code) DO UPDATE SET
          location_name = EXCLUDED.location_name,
          location_type = 'fuel_stop',
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          geocoded_at = now(),
          geocoding_source = EXCLUDED.geocoding_source,
          updated_at = now(),
          updated_by_user_id = EXCLUDED.updated_by_user_id
        RETURNING id::text
      `,
      [
        USMCA_COMPANY_ID,
        locationName,
        locationCode,
        s.city,
        s.state,
        s.latitude,
        s.longitude,
        `loves_network_file_${s.effective_date}`,
        OWNER_USER_ID,
      ]
    );
    const locationId = locRes.rows[0]!.id;
    locationsUpserted++;

    const vertices = circleToPolygonVertices(s.latitude, s.longitude, RADIUS_M, 16);
    await client.query(
      `
        INSERT INTO geo.geofences (
          operating_company_id, label, location_kind, location_ref_id, vertices_json, is_active,
          source, center_lat, center_lng, radius_m, enter_radius_m, exit_radius_m,
          external_source, external_ref, created_by_user_uuid, updated_by_user_uuid
        ) VALUES (
          $1::uuid, $2, 'fuel_stop', $3::uuid, $4::jsonb, true,
          'loves_import', $5, $6, $7, $8, $9,
          'loves_import', $10, $11::uuid, $11::uuid
        )
        ON CONFLICT (operating_company_id, external_source, external_ref) WHERE external_ref IS NOT NULL
        DO UPDATE SET
          label = EXCLUDED.label,
          location_ref_id = EXCLUDED.location_ref_id,
          vertices_json = EXCLUDED.vertices_json,
          is_active = true,
          center_lat = EXCLUDED.center_lat,
          center_lng = EXCLUDED.center_lng,
          radius_m = EXCLUDED.radius_m,
          enter_radius_m = EXCLUDED.enter_radius_m,
          exit_radius_m = EXCLUDED.exit_radius_m,
          updated_at = now(),
          updated_by_user_uuid = EXCLUDED.updated_by_user_uuid
      `,
      [
        USMCA_COMPANY_ID,
        locationName,
        locationId,
        JSON.stringify(vertices),
        s.latitude,
        s.longitude,
        RADIUS_M,
        ENTER_RADIUS_M,
        EXIT_RADIUS_M,
        s.store_no,
        OWNER_USER_ID,
      ]
    );
    geofencesUpserted++;
  }

  client.release();
  await pool.end();
  console.log(`\nEXECUTE done: ${locationsUpserted} mdata.locations upserted, ${geofencesUpserted} geo.geofences upserted.`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
