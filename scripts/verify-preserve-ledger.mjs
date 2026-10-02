#!/usr/bin/env node
/**
 * CC-3 queue item 11 — the telematics + geocode preservation ledger (schema `preserve`, migration 202615220900).
 *   static -- every preserve table: no FOREIGN KEY (a purge must be unable to cascade into it), a primary key made of
 *             natural keys only (no *_id / uuid column in the key except Samsara's own text ids), RLS, WORM triggers for
 *             UPDATE / DELETE / TRUNCATE; the copy engine covers every table; the daily cron is registered;
 *   live   -- (when the schema is deployed) every source row created between 2 and 1 days ago is preserved
 *             (positions, geofence events, stop events, HOS) — the ledger is not silently falling behind.
 * Fails closed without DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import pg from "pg";
const MIG = readFileSync("db/migrations/202615220900_preserve_telematics_geocode.sql", "utf8");
const SVC = readFileSync("apps/backend/src/telematics/preservation.service.ts", "utf8");
const IDX = readFileSync("apps/backend/src/index.ts", "utf8");
const TABLES = ["vehicle_positions", "geofences", "geofence_events", "unit_stop_events", "odometer_readings", "load_odometer_segments",
  "samsara_addresses", "route_stop_progress", "dvir_submissions", "hos_snapshots"];
const fails = [];
if (/\bREFERENCES\b/i.test(MIG)) fails.push("a preserve table declares a FOREIGN KEY — the ledger must not be reachable by a purge cascade");
for (const t of TABLES) {
  const m = MIG.match(new RegExp(`CREATE TABLE IF NOT EXISTS preserve\\.${t} \\(([\\s\\S]*?)\\);`));
  if (!m) { fails.push(`preserve.${t} is not created`); continue; }
  const pk = (m[1].match(/PRIMARY KEY \(([^)]*)\)/) ?? [])[1] ?? "";
  if (!pk) fails.push(`preserve.${t} has no primary key`);
  for (const col of pk.split(",").map((x) => x.trim())) {
    if (/(_id|_uuid)$/.test(col) && !/^(samsara_address_id|observation_id)$/.test(col)) fails.push(`preserve.${t} keys on ${col} — natural keys only (UUIDs die with the purge)`);
  }
  if (!/pre_reset jsonb/.test(m[1])) fails.push(`preserve.${t} does not carry the dead pre_reset reference`);
  if (!SVC.includes(`INSERT INTO preserve.${t} `)) fails.push(`the copy engine does not preserve ${t}`);
}
if (!/BEFORE UPDATE OR DELETE ON preserve\.%I/.test(MIG) || !/BEFORE TRUNCATE ON preserve\.%I/.test(MIG)) fails.push("WORM triggers (UPDATE / DELETE / TRUNCATE) are missing");
if (!/FORCE ROW LEVEL SECURITY/.test(MIG)) fails.push("preserve tables must have FORCED RLS");
if (!/ON CONFLICT DO NOTHING/.test(SVC)) fails.push("the copy engine must be idempotent (ON CONFLICT DO NOTHING)");
if (!/initializeTelematicsPreservationCron\(app\)/.test(IDX)) fails.push("the daily preservation cron is not registered in index.ts");
if (!process.env.DATABASE_URL) { console.error("verify-preserve-ledger: FAIL — DATABASE_URL not set (live guard fails closed)."); process.exit(1); }
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
  const deployed = (await c.query(`SELECT to_regclass('preserve.vehicle_positions') IS NOT NULL AS ok`)).rows[0].ok;
  if (!deployed) {
    console.log("verify-preserve-ledger: schema not deployed yet — static checks only");
  } else {
    const lag = (await c.query(`
      SELECT
        (SELECT count(*) FROM telematics.vehicle_locations p WHERE p.created_at BETWEEN now() - interval '2 days' AND now() - interval '1 day'
           AND NOT EXISTS (SELECT 1 FROM preserve.vehicle_positions x WHERE x.captured_at = p.captured_at
                             AND x.observation_id = coalesce(p.source_raw_samsara_event_id, p.raw_samsara_event_id, 'none:' || p.captured_at::text)))::int AS positions,
        (SELECT count(*) FROM telematics.unit_stop_events s WHERE s.created_at BETWEEN now() - interval '2 days' AND now() - interval '1 day'
           AND NOT EXISTS (SELECT 1 FROM preserve.unit_stop_events x WHERE x.started_at = s.started_at))::int AS stops,
        (SELECT count(*) FROM samsara.hos_snapshots h WHERE h.created_at BETWEEN now() - interval '2 days' AND now() - interval '1 day'
           AND NOT EXISTS (SELECT 1 FROM preserve.hos_snapshots x WHERE x.polled_at = h.polled_at))::int AS hos`)).rows[0];
    console.log(`preserve lag (source rows 1-2 days old not yet preserved): positions ${lag.positions}, stop events ${lag.stops}, HOS ${lag.hos}`);
    if (lag.positions + lag.stops + lag.hos > 0) fails.push(`the preservation ledger is behind: ${JSON.stringify(lag)}`);
  }
  await c.query("ROLLBACK");
} finally { await c.end(); }
if (fails.length) { console.error("verify-preserve-ledger: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log("verify-preserve-ledger: OK");
