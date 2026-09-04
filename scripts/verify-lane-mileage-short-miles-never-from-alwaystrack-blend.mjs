#!/usr/bin/env node
/**
 * verify-lane-mileage-short-miles-never-from-alwaystrack-blend.mjs
 *
 * LANE-MILEAGE-SHORT-MILES-REGRESSION (owner order 2026-09-04, URGENT, owner's own error).
 * catalogs.lane_mileage.short_miles must NEVER be populated from the current AlwaysTrack CSV
 * source's own short_miles column -- that column is St. Miles = Loaded Miles + Empty Miles, the
 * shortest+deadhead blend the law forbids storing as one number, not an independent shortest
 * figure. Migration 202613680001 restored practical_miles NOT NULL and the
 * lane_mileage_short_miles_not_over_practical CHECK (short_miles IS NULL OR short_miles <=
 * practical_miles), which the DB now enforces structurally -- but a guard is required in addition
 * to the constraint, not instead of it, per the owner's own ruling: "A guard is never dropped to
 * admit data -- the data is wrong, not the guard."
 *
 * TWO CHECKS:
 *   1. STATIC (always runs, no DB needed): both import scripts (seed-lane-mileage.mjs,
 *      merge-and-rescore-lane-mileage.mjs) must hard-discard short_miles/short_min/short_max
 *      (assign null, never a value read from the CSV row or computed from CSV data) and n_short
 *      (assign 0), and the INSERT loop must skip any row/group with a null practical_miles rather
 *      than attempt to write it (which would now violate the restored NOT NULL).
 *   2. LIVE (skips honestly with no DATABASE_URL / ENABLE_LIVE_DB_UNIT_TEST_GUARD, same pattern as
 *      every other live-DB guard in this repo): zero USMCA lane_mileage rows may have
 *      short_miles > practical_miles, and zero may have short_miles populated at all under the
 *      current source (this second condition is stricter than the DB CHECK -- it catches the
 *      exact regression this incident was, not just an inequality).
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

const LABEL = "verify-lane-mileage-short-miles-never-from-alwaystrack-blend";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SEED_PATH = "scripts/ops/seed-lane-mileage.mjs";
const MERGE_PATH = "scripts/ops/merge-and-rescore-lane-mileage.mjs";

function loadSource(path) {
  return readFileSync(path, "utf8");
}

export function collectStaticFailures(seedSrc, mergeSrc) {
  const failures = [];

  if (!seedSrc) {
    failures.push(`${SEED_PATH} not found`);
  } else {
    if (!/short_miles:\s*null,/.test(seedSrc)) {
      failures.push(`${SEED_PATH} does not hard-assign short_miles: null -- may be re-mapping the AlwaysTrack blend column verbatim`);
    }
    if (/short_miles:\s*num\(r\.short_miles\)/.test(seedSrc)) {
      failures.push(`${SEED_PATH} maps short_miles from the source row (num(r.short_miles)) -- this is the exact blend-import regression`);
    }
    if (!/num\(r\.practical_miles\) == null/.test(seedSrc)) {
      failures.push(`${SEED_PATH} does not skip rows with a blank practical_miles -- would violate the restored NOT NULL`);
    }
  }

  if (!mergeSrc) {
    failures.push(`${MERGE_PATH} not found`);
  } else {
    if (!/const weightedShortMiles = null;/.test(mergeSrc)) {
      failures.push(`${MERGE_PATH} no longer hard-nulls weightedShortMiles -- may be weight-averaging the AlwaysTrack blend column again`);
    }
    if (/shortRows\.reduce/.test(mergeSrc)) {
      failures.push(`${MERGE_PATH} still weight-averages a shortRows collection -- this is the exact blend-import regression`);
    }
    if (!/if \(r\.practical_miles == null\) continue;/.test(mergeSrc)) {
      failures.push(`${MERGE_PATH}'s INSERT loop does not skip null-practical_miles rows -- would violate the restored NOT NULL`);
    }
  }

  return failures;
}

async function collectLiveFailures() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString || process.env.ENABLE_LIVE_DB_UNIT_TEST_GUARD !== "true") {
    const missing = !connectionString ? "DATABASE_URL is unset" : "ENABLE_LIVE_DB_UNIT_TEST_GUARD is not 'true'";
    console.log(`${LABEL} — static checks only · SKIPPED-DB-CHECK (${missing})`);
    return [];
  }
  const client = new Client(buildPgClientConfig(connectionString));
  await client.connect();
  try {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const res = await client.query(
      `SELECT
         count(*) FILTER (WHERE short_miles > practical_miles)::int AS impossible,
         count(*) FILTER (WHERE short_miles IS NOT NULL)::int AS short_populated
       FROM catalogs.lane_mileage WHERE operating_company_id = $1::uuid`,
      [USMCA]
    );
    const row = res.rows[0];
    const failures = [];
    if (row.impossible > 0) failures.push(`${row.impossible} live lane(s) have short_miles > practical_miles -- the exact impossible-lane symptom, should be structurally impossible with the restored CHECK`);
    if (row.short_populated > 0) failures.push(`${row.short_populated} live lane(s) have short_miles populated at all -- under the current AlwaysTrack source this must always be NULL`);
    return failures;
  } finally {
    await client.end();
  }
}

if (process.argv.includes("--selftest")) {
  const seedSrc = loadSource(SEED_PATH);
  const mergeSrc = loadSource(MERGE_PATH);
  const baseline = collectStaticFailures(seedSrc, mergeSrc);
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }

  const escaped = [];

  const badSeed = seedSrc.replace("short_miles: null,", "short_miles: num(r.short_miles),");
  if (badSeed === seedSrc || collectStaticFailures(badSeed, mergeSrc).length === 0) {
    escaped.push("seed-lane-mileage.mjs reverted to mapping short_miles from the source row");
  }

  const badMerge = mergeSrc.replace("const weightedShortMiles = null;", "const weightedShortMiles = 999;");
  if (badMerge === mergeSrc || collectStaticFailures(seedSrc, badMerge).length === 0) {
    escaped.push("merge-and-rescore-lane-mileage.mjs's weightedShortMiles hardcode removed");
  }

  const badSkip = seedSrc.replace("if (num(r.practical_miles) == null) {", "if (false) {");
  if (badSkip === seedSrc || collectStaticFailures(badSkip, mergeSrc).length === 0) {
    escaped.push("seed-lane-mileage.mjs's null-practical skip removed");
  }

  if (escaped.length) {
    console.error(`${LABEL} SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 3/3 plants rejected`);
}

const seedSrc = loadSource(SEED_PATH);
const mergeSrc = loadSource(MERGE_PATH);
const staticFailures = collectStaticFailures(seedSrc, mergeSrc);
const liveFailures = await collectLiveFailures();
const failures = [...staticFailures, ...liveFailures];
if (failures.length > 0) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `${LABEL}: OK — both import scripts always discard the AlwaysTrack blend column, and no live lane carries a short_miles value`
);
