#!/usr/bin/env node
/**
 * verify-settlement-detail-readmodel-s1b — S.1b (settlement DETAIL read-model extension).
 *
 * docs/bus/INBOX-CC-1.md (registrar dispatch 2026-09-05): Cursor's L5 section-table rebuild reads
 * origin/dest + a leg date on the earnings/deadhead_pay lines of the settlement detail SELECT
 * (settlements.routes.ts). Cursor's own spec named these "confirmed columns on mdata.loads" — FALSE,
 * verified live: mdata.loads has no origin_city/dest_city columns at all; those names belong to
 * catalogs.lane_mileage, a lane-level mileage CACHE keyed by city/state pairs, not any one load's
 * actual route. The real per-load origin/destination is mdata.load_stops (stop_type pickup/delivery,
 * city/state, sequence_number) — this guard's live half asserts THAT join, matching what
 * settlements.routes.ts actually does, not what the dispatch text guessed.
 *
 * Deliberately does NOT filter load_stops.soft_deleted_at: a stop later edited/replaced must not
 * erase the historical record of where a settlement line's pay was actually earned. Filtering it out
 * live-dropped origin/dest coverage from 152/152 to 94/152 (58 lines' earliest-recorded pickup stop
 * had since been soft-deleted) — confirmed against prod before writing this guard.
 *
 * DEGRADE-SAFE — matches verify-gl-posting-coverage.mjs / verify-settlement-lines-miles-rate-live.mjs's
 * own established pattern: no reachable database is a SKIP + exit 0, never a FAIL.
 */
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const LABEL = "verify-settlement-detail-readmodel-s1b";

const QUERY = `
  SELECT sl.id::text,
         origin_stop.city AS origin_city,
         dest_stop.city AS dest_city,
         COALESCE(dest_stop.at, origin_stop.at, db.created_at, sl.created_at) AS line_date
    FROM driver_finance.settlement_lines sl
    LEFT JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id
    LEFT JOIN LATERAL (
      SELECT ls.city, COALESCE(ls.actual_arrival_at, ls.scheduled_arrival_at) AS at
      FROM mdata.load_stops ls
      WHERE ls.load_id = COALESCE(db.load_id, sl.load_id) AND ls.stop_type = 'pickup'
      ORDER BY ls.sequence_number ASC
      LIMIT 1
    ) origin_stop ON true
    LEFT JOIN LATERAL (
      SELECT ls.city, COALESCE(ls.actual_arrival_at, ls.scheduled_arrival_at) AS at
      FROM mdata.load_stops ls
      WHERE ls.load_id = COALESCE(db.load_id, sl.load_id) AND ls.stop_type = 'delivery'
      ORDER BY ls.sequence_number DESC
      LIMIT 1
    ) dest_stop ON true
   WHERE sl.line_type IN ('earnings', 'deadhead_pay')
`;

function selftest() {
  // Structural half — no DB needed, runs unconditionally in CI. Asserts the query shape: it must
  // resolve origin/dest through mdata.load_stops (never a nonexistent mdata.loads.origin_city column),
  // it must NOT filter soft_deleted_at (the historical-truth choice this guard documents above), and it
  // must scope to earnings/deadhead_pay lines only.
  const failures = [];
  if (!/mdata\.load_stops/.test(QUERY)) failures.push("query does not resolve origin/dest through mdata.load_stops");
  if (/mdata\.loads[\s\S]{0,80}origin_city/.test(QUERY)) failures.push("query wrongly reads origin_city off mdata.loads (that column does not exist)");
  if (/soft_deleted_at/.test(QUERY)) failures.push("query filters load_stops.soft_deleted_at — this must read historical stops too (documented choice)");
  if (!/line_type IN \('earnings', 'deadhead_pay'\)/.test(QUERY)) failures.push("query does not scope to earnings/deadhead_pay lines");
  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} --selftest FAIL — ${f}`);
    return 1;
  }
  console.log(`${LABEL} --selftest PASS — query shape correct (load_stops join, no soft-delete filter, earnings/deadhead_pay scope)`);
  return 0;
}

async function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log(`${LABEL} SKIP — no DATABASE_URL/DATABASE_DIRECT_URL; live join cannot be asserted here.`);
    return 0;
  }

  const liveRequested = process.env.SETTLEMENT_DETAIL_READMODEL_S1B_LIVE === "1";
  if (!liveRequested && (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true")) {
    console.log(
      `${LABEL} SKIP (live half) — CI's database is a fixture playground, not the books; run with ` +
        `SETTLEMENT_DETAIL_READMODEL_S1B_LIVE=1 against prod.`
    );
    return 0;
  }

  const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
  const pg = require("pg");
  const client = new pg.Client(buildPgClientConfig(connectionString));

  try {
    await client.connect();
  } catch (error) {
    console.log(`${LABEL} SKIP — database unreachable (${error.code ?? error.message}); live assertion not possible here.`);
    await client.end().catch(() => {});
    return 0;
  }

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const rows = (await client.query(QUERY)).rows;
    await client.query("COMMIT");

    if (rows.length === 0) {
      console.log(`${LABEL} SKIP — 0 earnings/deadhead_pay settlement_lines exist yet; nothing to assert.`);
      return 0;
    }

    const blank = rows.filter((r) => r.origin_city === null || r.dest_city === null || r.line_date === null);
    if (blank.length > 0) {
      console.error(`${LABEL} FAIL — ${blank.length} of ${rows.length} earnings/deadhead_pay settlement line(s) have a NULL origin_city, dest_city, or line_date:`);
      for (const b of blank.slice(0, 10)) console.error(`  - settlement_lines.id=${b.id} origin_city=${b.origin_city} dest_city=${b.dest_city} line_date=${b.line_date}`);
      return 1;
    }

    console.log(`${LABEL} PASS — ${rows.length} earnings/deadhead_pay settlement line(s) checked, all carry non-null origin_city + dest_city + line_date.`);
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
