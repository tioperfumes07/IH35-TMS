#!/usr/bin/env node
// ROUND 155.18 -- two confirmed scheduled-writer defects (found by tracing the actual row counts
// back to their source queries, not by static analysis): maintenance.pm_auto_wo_log's writer
// (listActiveSchedules in pm-auto-engine.service.ts, cron "5 * * * *" hourly) and
// samsara.hos_snapshots' writer (listActiveHosDriverRoster in active-hos-driver-roster.service.ts,
// cron every 5 minutes via samsara-positions-cron.ts) both selected sample-flagged master rows
// (mdata.units / mdata.drivers) with no is_sample_data exclusion, because Owner-role RLS bypass
// returns every row including sample ones and nothing else filtered them out.
//
// This guard is a LIVE check, not a static one: it re-runs each writer's own selection query
// (read-only) and asserts it returns zero sample-flagged rows. It is deliberately narrow (the two
// confirmed writers) rather than a general AST scan for every possible job -- extend the CHECKS
// array below when another writer against sample-flagged master data is found; do not treat an
// empty CHECKS-array pass as proof no other writer exists.
import pg from "pg";

export const REQUIRES_LIVE_DB =
  "live-data guard: re-runs the two confirmed scheduled-writer selection queries against real mdata.units/mdata.drivers to assert they select zero sample-flagged rows; no static-only path exists.";

const CHECKS = [
  {
    name: "maintenance.pm_auto_wo_log writer (listActiveSchedules)",
    sql: `
      SELECT COUNT(*) AS n
      FROM maintenance.pm_schedules ps
      JOIN mdata.units u ON u.id = ps.unit_id
      WHERE ps.is_active = true AND u.is_sample_data IS TRUE
    `,
  },
  {
    name: "samsara.hos_snapshots writer (listActiveHosDriverRoster)",
    sql: `
      SELECT COUNT(*) AS n
      FROM mdata.drivers d
      WHERE d.samsara_driver_id IS NOT NULL
        AND d.deactivated_at IS NULL
        AND d.status = 'Active'
        AND d.is_sample_data IS TRUE
    `,
  },
];

async function main() {
  // H-4 / X-31 (ROUND 301) -- FAIL CLOSED BEFORE CONNECTING, never hang.
  // This guard already declares REQUIRES_LIVE_DB, which excludes it from verify-static's no-DB
  // sweep. That declaration does NOT make it safe under verify-no-silent-db-skip, which strips
  // DATABASE_URL and captures the real exit code: `new pg.Client({ connectionString: undefined })`
  // does not throw, it falls back to libpq defaults (local socket, PGUSER) and BLOCKS until the
  // harness timeout. The harness counts a hang as a failure, correctly -- "a hang is not a pass
  // either" -- so both this guard and every seat's money-pr-local-gate run were red on main with
  // nothing in any PR's own diff to explain it. ROUND 29.9-B owner ruling: a live money guard that
  // cannot connect is a FAIL, never a pass. An explicit non-zero exit is how that ruling is
  // honoured; hanging silently is the one outcome it forbids.
  if (!process.env.DATABASE_URL) {
    console.error(
      "verify-no-job-writes-against-sample-data FAILED -- DATABASE_URL not set. This is a live-data guard (see REQUIRES_LIVE_DB above); " +
      "it refuses to report success it cannot prove, and exits rather than blocking on libpq defaults."
    );
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  let failed = false;
  for (const check of CHECKS) {
    const r = await client.query(check.sql);
    const n = Number(r.rows[0].n);
    if (n > 0) {
      failed = true;
      console.log(`verify-no-job-writes-against-sample-data FAIL — ${check.name}: selects ${n} sample-flagged row(s), would write against them on its next tick.`);
    } else {
      console.log(`verify-no-job-writes-against-sample-data OK — ${check.name}: 0 sample-flagged rows selected.`);
    }
  }
  await client.end();

  if (failed) process.exit(1);
  console.log(`verify-no-job-writes-against-sample-data PASS — ${CHECKS.length} known writer(s) checked, none select sample-flagged rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
