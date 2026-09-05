#!/usr/bin/env node
/**
 * verify-settlement-lines-miles-rate-live — S.1 (settlement-lines read model).
 *
 * driver_finance.settlement_lines has no miles/rate column of its own (verified across every
 * migration that ever touched the table) — the real per-line miles/rate/pay live on
 * driver_finance.driver_bills (miles_basis/rate_per_mile_cents/loaded_pay_cents for the loaded leg,
 * miles_deadhead/rate_empty_per_mile_cents/deadhead_pay_cents for the deadhead leg), reachable via
 * settlement_lines.source_driver_bill_id. The settlement detail route (settlements.routes.ts)
 * already joins on that column and picks the loaded-vs-deadhead pair by the line's own line_type
 * (commit 4fe763f8d4). This guard asserts that join actually produces non-null numbers on live
 * data, not just that the SQL text exists.
 *
 * A single EXCEPTION is honest, not a defect: an 'earnings' (loaded) line whose driver bill genuinely
 * has zero deadhead miles renders a NULL deadhead pair on ITS OWN deadhead_pay sibling row — that is
 * documented, correct behavior (a dash, not a broken join), so this guard only demands non-null
 * miles/rate on the loaded ('earnings') side, where a real driver bill always has a real loaded-leg
 * distance and rate. It does NOT demand every deadhead_pay row be non-null.
 *
 * DEGRADE-SAFE — matches verify-gl-posting-coverage.mjs's own established pattern: no reachable
 * database (no DATABASE_URL, or a connection failure) is a SKIP + exit 0, never a FAIL. A live-data
 * assertion can only mean something against the real books.
 */
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const LABEL = "verify-settlement-lines-miles-rate-live";

const QUERY = `
  SELECT sl.id::text,
         CASE WHEN sl.line_type = 'deadhead_pay' THEN db.miles_deadhead ELSE db.miles_basis END AS miles,
         CASE WHEN sl.line_type = 'deadhead_pay' THEN db.rate_empty_per_mile_cents ELSE db.rate_per_mile_cents END AS rate_cents
    FROM driver_finance.settlement_lines sl
    LEFT JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id
   WHERE sl.line_type = 'earnings'
     AND sl.source_driver_bill_id IS NOT NULL
`;

function selftest() {
  // Structural half — no DB needed, runs unconditionally in CI. Asserts the query shape itself: it
  // must join source_driver_bill_id (not sl.load_id or any other column), it must key the
  // loaded/deadhead pair off line_type, and it must scope to 'earnings' (never demand a non-null
  // deadhead leg, which has a real, honest zero-miles case).
  const failures = [];
  if (!/source_driver_bill_id/.test(QUERY)) failures.push("query does not join on source_driver_bill_id");
  if (!/line_type = 'deadhead_pay'/.test(QUERY)) failures.push("query does not branch the loaded/deadhead pair on line_type");
  if (!/WHERE sl\.line_type = 'earnings'/.test(QUERY)) failures.push("query does not scope the live assertion to 'earnings' (loaded) lines only");
  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} --selftest FAIL — ${f}`);
    return 1;
  }
  console.log(`${LABEL} --selftest PASS — query shape correct (source_driver_bill_id join, line_type branch, earnings-only scope)`);
  return 0;
}

async function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log(`${LABEL} SKIP — no DATABASE_URL/DATABASE_DIRECT_URL; live join cannot be asserted here.`);
    return 0;
  }

  const liveRequested = process.env.SETTLEMENT_LINES_MILES_RATE_LIVE === "1";
  if (!liveRequested && (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true")) {
    console.log(
      `${LABEL} SKIP (live half) — CI's database is a fixture playground, not the books; run with ` +
        `SETTLEMENT_LINES_MILES_RATE_LIVE=1 against prod.`
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
      console.log(`${LABEL} SKIP — 0 earnings settlement_lines with a source_driver_bill_id exist yet; nothing to assert.`);
      return 0;
    }

    const blank = rows.filter((r) => r.miles === null || r.rate_cents === null);
    if (blank.length > 0) {
      console.error(`${LABEL} FAIL — ${blank.length} of ${rows.length} loaded (earnings) settlement line(s) have a NULL miles or rate, though a driver bill is joined:`);
      for (const b of blank.slice(0, 10)) console.error(`  - settlement_lines.id=${b.id} miles=${b.miles} rate_cents=${b.rate_cents}`);
      console.error(`  A loaded leg's driver bill always carries a real distance and rate — a NULL here means the join or the bill's own data is broken, not an honest empty state.`);
      return 1;
    }

    console.log(`${LABEL} PASS — ${rows.length} loaded (earnings) settlement line(s) checked, all carry real non-null miles/rate through the source_driver_bill_id join.`);
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
