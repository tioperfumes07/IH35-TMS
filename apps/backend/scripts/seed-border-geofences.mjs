#!/usr/bin/env node
/**
 * GAP-26 — One-shot seed for 5 Laredo border geofences into integrations.geofences.
 * Safe to re-run (upsert on name).
 */
import pg from "pg";

const { Pool } = pg;

const GEOFENCES = [
  { name: "Laredo Bridge I (Gateway to the Americas)",  crossing_point: "laredo-i",   lat: 27.4934, lng: -99.5117, radius_m: 1000 },
  { name: "Laredo Bridge II (Juarez-Lincoln)",           crossing_point: "laredo-ii",  lat: 27.5037, lng: -99.5027, radius_m: 1000 },
  { name: "Laredo Bridge III (World Trade Bridge)",      crossing_point: "laredo-iii", lat: 27.5640, lng: -99.4697, radius_m: 1000 },
  { name: "Laredo Bridge IV (Colombia Solidarity)",      crossing_point: "laredo-iv",  lat: 27.9022, lng: -99.5340, radius_m: 1000 },
  { name: "Colombia-Solidarity International Bridge",    crossing_point: "colombia",   lat: 27.9022, lng: -99.5340, radius_m: 1000 },
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const client = await pool.connect();
  try {
    for (const gf of GEOFENCES) {
      await client.query(
        `INSERT INTO integrations.geofences (name, geofence_type, center_lat, center_lng, radius_meters, category, metadata)
         VALUES ($1, 'circle', $2, $3, $4, 'border', $5::jsonb)
         ON CONFLICT (name) DO UPDATE SET center_lat = EXCLUDED.center_lat, center_lng = EXCLUDED.center_lng,
           radius_meters = EXCLUDED.radius_meters, updated_at = now()`,
        [gf.name, gf.lat, gf.lng, gf.radius_m, JSON.stringify({ crossing_point: gf.crossing_point })]
      );
      console.log(`Seeded: ${gf.name}`);
    }
    console.log("✓ All 5 border geofences seeded");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
