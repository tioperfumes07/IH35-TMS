#!/usr/bin/env node
/**
 * GAP-54 — One-shot migration: arrival geofences 40233.6m → 76.2m.
 * Usage: node apps/backend/scripts/migrate-existing-wf-051-geofences.mjs [--dry-run]
 */
import pg from "pg";

const DRY_RUN = process.argv.includes("--dry-run");
const NEW_RADIUS = 76.2;
const LEGACY_RADIUS = 40233.6;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT id::text, name, radius_meters FROM integrations.geofences
       WHERE geofence_type = 'arrival' OR (metadata->>'kind') = 'arrival'
          OR radius_meters >= $1`,
      [LEGACY_RADIUS - 1]
    );
    console.log(`Found ${res.rowCount} arrival geofence(s) to migrate`);
    for (const row of res.rows) {
      console.log(`${DRY_RUN ? "[dry-run] " : ""}UPDATE ${row.id} ${row.name}: ${row.radius_meters} → ${NEW_RADIUS}`);
      if (!DRY_RUN) {
        await client.query(
          `UPDATE integrations.geofences SET radius_meters = $2, updated_at = now() WHERE id = $1::uuid`,
          [row.id, NEW_RADIUS]
        );
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
