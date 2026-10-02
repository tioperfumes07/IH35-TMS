#!/usr/bin/env npx tsx
// CC-3 queue item 11 — run the preservation engine by hand. Default: full backfill (every row ever observed).
// `--since-days N` limits to source rows created in the last N days. Idempotent (ON CONFLICT DO NOTHING); writes only
// the append-only `preserve` schema (no business table is touched), so it needs no AUTH.
// Usage: DATABASE_URL=<prod> npx tsx scripts/ops/preserve-telematics.mts [--since-days 3]
import pg from "pg";
import { preserveTelematics } from "../../apps/backend/src/telematics/preservation.service.ts";

const i = process.argv.indexOf("--since-days");
const sinceDays = i > 0 ? Number(process.argv[i + 1]) : null;
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  await c.query("BEGIN");
  await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await c.query("SET LOCAL statement_timeout = '20min'");
  const t = Date.now();
  const preserved = await preserveTelematics(c as never, { sinceDays });
  await c.query("COMMIT");
  // The preserve tables are FORCED-RLS: read the totals under the bypass too, or every count reads 0.
  await c.query("BEGIN READ ONLY");
  await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
  const totals = (await c.query(`SELECT 'vehicle_positions' t, count(*)::int n FROM preserve.vehicle_positions UNION ALL SELECT 'geofences', count(*) FROM preserve.geofences
    UNION ALL SELECT 'geofence_events', count(*) FROM preserve.geofence_events UNION ALL SELECT 'unit_stop_events', count(*) FROM preserve.unit_stop_events
    UNION ALL SELECT 'odometer_readings', count(*) FROM preserve.odometer_readings UNION ALL SELECT 'load_odometer_segments', count(*) FROM preserve.load_odometer_segments
    UNION ALL SELECT 'samsara_addresses', count(*) FROM preserve.samsara_addresses UNION ALL SELECT 'route_stop_progress', count(*) FROM preserve.route_stop_progress
    UNION ALL SELECT 'dvir_submissions', count(*) FROM preserve.dvir_submissions UNION ALL SELECT 'hos_snapshots', count(*) FROM preserve.hos_snapshots`)).rows;
  await c.query("ROLLBACK");
  console.log(JSON.stringify({ since_days: sinceDays, seconds: Math.round((Date.now() - t) / 1000), newly_preserved: preserved, preserved_totals: totals }));
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await c.end();
}
