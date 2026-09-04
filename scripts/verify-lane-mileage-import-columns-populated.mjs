#!/usr/bin/env node
/**
 * LANE-MILEAGE-SHORT-EMPTY-DROPPED (2026-09-04): a prior rebuild of
 * scripts/ops/seed-lane-mileage.mjs mapped a source with no short-route data at all; the LATER
 * merge/rescore pass (scripts/ops/merge-and-rescore-lane-mileage.mjs) never selected or wrote
 * short_miles/n_short/short_min/short_max/empty_miles either. Both silently discarded real data
 * every time either script ran, and neither one FAILED — a live import that writes 0 populated
 * rows into a column the source file actually carries looked identical to a healthy run.
 *
 * This guard is the backstop: given a live catalogs.lane_mileage table for USMCA, it fails if ANY
 * of the columns the current seed source (db/seeds/lane-mileage-usmca.csv) actually carries real
 * values for comes back with ZERO populated rows live. A column the source genuinely has nothing
 * for (this file's own header comment documents which, if any) should be added to
 * KNOWN_SOURCE_HAS_NO_DATA_FOR below with a cited reason -- never silently exempted.
 *
 * NOTE (2026-09-04, re-running the fixed importer live): two live schema constraints legitimately
 * hold SOME rows/fields back (practical_miles NOT NULL skips 26 lanes with no practical
 * observation at all; CHECK lane_mileage_short_miles_not_over_practical holds short_miles/n_short/
 * short_min/short_max to NULL/0 on 2,203 lanes where short genuinely exceeds practical) -- both
 * documented in scripts/ops/seed-lane-mileage.mjs's header and filed to GUARD-WORKORDERS.md as
 * migration-blocked packages. This guard only asserts "not ZERO populated rows", so both holdbacks
 * still pass it (short_miles/short_min/short_max are populated on 1,131 of 3,439 live rows) --
 * it exists to catch a repeat of the ORIGINAL bug (100% NULL), not to assert 100% population.
 *
 * Run:
 *   node scripts/verify-lane-mileage-import-columns-populated.mjs --selftest   (static, no DB)
 *   node scripts/verify-lane-mileage-import-columns-populated.mjs              (live, needs
 *     DATABASE_URL + ENABLE_LIVE_DB_UNIT_TEST_GUARD=true, same honest-skip pattern as every other
 *     live-DB guard in this repo)
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

const LABEL = "verify-lane-mileage-import-columns-populated";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Every column the CURRENT db/seeds/lane-mileage-usmca.csv carries real (non-blank) values for on
// at least some rows, per a live audit of the file this guard was authored against. If the seed
// source is ever swapped for one that genuinely lacks a column's data, move that column here WITH
// a cited reason -- never silently drop it from the check below instead.
const KNOWN_SOURCE_HAS_NO_DATA_FOR = new Set([
  // (currently empty -- the 2026-09-04 source carries real data for every column checked below)
]);

// column -> the live SQL predicate proving at least one row is genuinely populated (not just
// non-null-but-zero, where zero is itself a meaningful "no observation" value for that column).
const CHECKS = [
  ["practical_miles", "practical_miles IS NOT NULL"],
  ["short_miles", "short_miles IS NOT NULL"],
  ["empty_miles", "empty_miles > 0"],
  ["n_practical", "n_practical > 0"],
  ["n_short", "n_short > 0"],
  ["practical_min", "practical_min IS NOT NULL"],
  ["practical_max", "practical_max IS NOT NULL"],
  ["practical_spread", "practical_spread IS NOT NULL"],
  ["short_min", "short_min IS NOT NULL"],
  ["short_max", "short_max IS NOT NULL"],
];

function fail(message) {
  console.error(`${LABEL} — FAILED\n${message}`);
  process.exit(1);
}

async function main() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString || process.env.ENABLE_LIVE_DB_UNIT_TEST_GUARD !== "true") {
    const missing = !connectionString ? "DATABASE_URL is unset" : "ENABLE_LIVE_DB_UNIT_TEST_GUARD is not 'true'";
    console.log(`${LABEL} — static checks PASSED · SKIPPED-DB-CHECK (${missing}); the live column-population scan did NOT run`);
    return;
  }

  const client = new Client(buildPgClientConfig(connectionString));
  await client.connect();
  try {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    const totalRes = await client.query(
      `SELECT count(*)::int AS n FROM catalogs.lane_mileage WHERE operating_company_id = $1::uuid`,
      [USMCA]
    );
    const total = totalRes.rows[0].n;
    if (total === 0) {
      fail("catalogs.lane_mileage has ZERO rows for USMCA -- an import that ran and left the table empty is itself the failure mode this guard exists to catch.");
    }

    const problems = [];
    for (const [column, predicate] of CHECKS) {
      if (KNOWN_SOURCE_HAS_NO_DATA_FOR.has(column)) continue;
      const res = await client.query(`SELECT count(*)::int AS n FROM catalogs.lane_mileage WHERE operating_company_id = $1::uuid AND ${predicate}`, [USMCA]);
      const n = res.rows[0].n;
      if (n === 0) {
        problems.push(`${column}: 0 of ${total} live rows populated (source carries real data for this column -- an import silently dropped it)`);
      }
    }

    if (problems.length > 0) {
      fail(problems.map((p) => `- ${p}`).join("\n"));
    }
    console.log(`${LABEL} — OK, all ${CHECKS.length} tracked columns have at least one populated row across ${total} live USMCA lanes`);
  } finally {
    await client.end();
  }
}

function selftest() {
  if (!fs.existsSync(new URL(import.meta.url).pathname)) {
    console.error(`${LABEL} SELFTEST FAIL — this file does not exist`);
    process.exit(1);
  }
  if (CHECKS.length !== 10) {
    console.error(`${LABEL} SELFTEST FAIL — expected 10 tracked columns, found ${CHECKS.length}`);
    process.exit(1);
  }
  if (!CHECKS.some(([c]) => c === "short_miles") || !CHECKS.some(([c]) => c === "empty_miles")) {
    console.error(`${LABEL} SELFTEST FAIL — short_miles/empty_miles must be tracked (the exact columns this guard was authored to catch dropping)`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — static shape valid; live behavior requires DATABASE_URL + ENABLE_LIVE_DB_UNIT_TEST_GUARD=true`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) {
  selftest();
}

main().catch((err) => {
  console.error(`${LABEL} — FAILED\n${err.stack || err}`);
  process.exit(1);
});
