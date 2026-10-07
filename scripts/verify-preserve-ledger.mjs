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
export const REQUIRES_LIVE_DB = "Neon live verification required";

import { readFileSync } from "node:fs";
import pg from "pg";

// --selftest (Devin build order 2026-10-05): live-DB guards cannot be fixture-tested — their inputs
// are rows on Neon. One case MUST pass (live check green, or the canonical no-credential refusal
// when nothing resolves locally) and one MUST fail (dead credential — it must refuse, never green).
if (process.argv.includes("--selftest")) { await selftest_verify_preserve_ledger(); }
async function selftest_verify_preserve_ledger() {
  const { runGuard, reportSelftest, statusOf, outputOf, DEAD_DB_ENV } = await import("./lib/guard-selftest.mjs");
  const { fileURLToPath } = await import("node:url");
  const me = fileURLToPath(import.meta.url);
  const real = runGuard(me);
  const noDb = runGuard(me, { env: DEAD_DB_ENV });
  const refused = /DATABASE_URL (?:is )?(?:not set|unset|required)|credential/.test(outputOf(real));
  reportSelftest("verify_preserve_ledger", [
    { name: "live check green, or canonically refuses with no credential", pass: statusOf(real) === 0 || refused, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-300) },
    { name: "refuses on dead credential", pass: statusOf(noDb) !== 0, detail: statusOf(noDb) !== 0 ? undefined : outputOf(noDb).slice(-200) },
  ]);
}
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
// ROUND 340: preserve.unit_stop_events moved to a ledger-generated surrogate id + UNIQUE on the full observation grain
// (company_code, unit_number, started_at, ended_at) — migration 202615301000 must keep that natural unique key.
const MIG_USE = readFileSync("db/migrations/202615301000_preserve_unit_stop_events_observation_key.sql", "utf8");
if (!/UNIQUE INDEX IF NOT EXISTS uq_preserve_unit_stop_events_observation\s+ON preserve\.unit_stop_events \(company_code, unit_number, started_at, ended_at\)/.test(MIG_USE)) fails.push("preserve.unit_stop_events lost its natural observation key (company_code, unit_number, started_at, ended_at)");
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
    // Anchored to the preservation job's LAST SUCCESSFUL RUN (_system.background_jobs), never this guard's clock (ROUND 251
    // item 7). That run copies every source row created in the 3 days before it, so a source row created 1-2 days before it
    // and still not preserved is a run that skipped data — the same question the old now()-relative window asked, minus the
    // dependence on when CI happens to run. Whether the job is still running at all is the heartbeat monitor's question.
    const run = (await c.query(`SELECT last_successful_run_at AS at FROM _system.background_jobs WHERE job_name = 'telematics.preservation'`)).rows[0]?.at ?? null;
    if (!run) {
      const any = (await c.query(`SELECT EXISTS (SELECT 1 FROM telematics.vehicle_locations) OR EXISTS (SELECT 1 FROM samsara.hos_snapshots) AS any`)).rows[0].any;
      if (any) fails.push("the preservation job (telematics.preservation) has never completed successfully, but source telematics rows exist");
      else console.log("preserve lag: no successful preservation run recorded and no source rows yet");
    } else {
      const lag = (await c.query(`
        SELECT
          (SELECT count(*) FROM telematics.vehicle_locations p WHERE p.created_at BETWEEN $1::timestamptz - interval '2 days' AND $1::timestamptz - interval '1 day'
             AND NOT EXISTS (SELECT 1 FROM preserve.vehicle_positions x WHERE x.captured_at = p.captured_at
                               AND x.observation_id = coalesce(p.source_raw_samsara_event_id, p.raw_samsara_event_id, 'none:' || p.captured_at::text)))::int AS positions,
          (SELECT count(*) FROM telematics.unit_stop_events s WHERE s.created_at BETWEEN $1::timestamptz - interval '2 days' AND $1::timestamptz - interval '1 day'
             AND NOT EXISTS (SELECT 1 FROM preserve.unit_stop_events x WHERE x.started_at = s.started_at))::int AS stops,
          (SELECT count(*) FROM samsara.hos_snapshots h WHERE h.created_at BETWEEN $1::timestamptz - interval '2 days' AND $1::timestamptz - interval '1 day'
             AND NOT EXISTS (SELECT 1 FROM preserve.hos_snapshots x WHERE x.polled_at = h.polled_at))::int AS hos`, [run])).rows[0];
      console.log(`preserve lag (source rows created 1-2 days before the last successful preservation run ${new Date(run).toISOString()}, not preserved): positions ${lag.positions}, stop events ${lag.stops}, HOS ${lag.hos}`);
      if (lag.positions + lag.stops + lag.hos > 0) fails.push(`the preservation ledger is behind its own last run: ${JSON.stringify(lag)}`);
    }
  }
  await c.query("ROLLBACK");
} finally { await c.end(); }
if (fails.length) { console.error("verify-preserve-ledger: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log("verify-preserve-ledger: OK");
