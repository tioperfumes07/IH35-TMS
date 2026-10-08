#!/usr/bin/env node
/**
 * GUARD (ROUND 441.21-B RELAY DATE LAW): USMCA Relay fills start 2026-08-03.
 *
 * Owner: every fill dated before 2026-08-03 on the Transportation key belongs to TRANSPORTATION
 * and is EXCLUDED from USMCA. Hard-coded in ingest, backfill, and the matching engine. This guard
 * fails if (a) the floor constant is missing/wrong, (b) ingest/backfill no longer clamp or skip
 * pre-floor rows, or (c) live USMCA has any non-voided relay_fuel row with a transaction date
 * before the floor.
 *
 * STATIC (always):
 *   S1 RELAY_USMCA_DATA_FLOOR === '2026-08-03' in relay-usmca-date-floor.ts
 *   S2 ingest cron imports the floor and skips/clamps USMCA pre-floor fills
 *   S3 windowed pull / backfill path clamps range start for USMCA
 * LIVE (DATABASE_URL):
 *   L1 no USMCA integrations.relay_fuel_transactions row (voided_at IS NULL) has
 *      COALESCE(relay_created_at, created_at)::date < 2026-08-03
 *
 * Invoked from scripts/verify-relay-tick-completes.mjs (R8) so it does not grow the orphan-guard census.
 * Run: node scripts/lib/relay-usmca-date-floor-guard.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "relay-usmca-date-floor-guard";
const FLOOR_FILE = "apps/backend/src/integrations/relay-payments/relay-usmca-date-floor.ts";
const CRON = "apps/backend/src/integrations/relay-payments/relay-fuel-ingest.cron.ts";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const FLOOR = "2026-08-03";

export const ALLOW_OFFLINE_SKIP =
  "static S1–S3 always run and fail closed; live L1 runs whenever DATABASE_URL is set";

export function staticProblems(floorSrc, cronSrc) {
  const p = [];
  if (!new RegExp(`RELAY_USMCA_DATA_FLOOR\\s*=\\s*"${FLOOR}"`).test(floorSrc)) {
    p.push(`S1: RELAY_USMCA_DATA_FLOOR must be hardcoded "${FLOOR}" in ${FLOOR_FILE}`);
  }
  if (!/from "\.\/relay-usmca-date-floor\.js"/.test(cronSrc) && !/from '\.\/relay-usmca-date-floor\.js'/.test(cronSrc)) {
    p.push("S2: relay-fuel-ingest.cron.ts must import relay-usmca-date-floor");
  }
  if (!/isBeforeRelayUsmcaFloor/.test(cronSrc) || !/isUsmcaOperatingCompany/.test(cronSrc)) {
    p.push("S2: ingest must skip USMCA fills before the floor (isBeforeRelayUsmcaFloor + isUsmcaOperatingCompany)");
  }
  if (!/clampRelayRangeStartForCompany/.test(cronSrc)) {
    p.push("S3: backfill must clamp range start via clampRelayRangeStartForCompany");
  }
  if (!cronSrc.includes(FLOOR) && !/RELAY_USMCA_DATA_FLOOR/.test(cronSrc)) {
    p.push(`S2/S3: cron must reference the ${FLOOR} floor (constant or literal)`);
  }
  return p;
}

async function liveProblems(url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    const r = await client.query(
      `SELECT id::text, transaction_id,
              COALESCE(relay_created_at, created_at)::date::text AS fill_day
         FROM integrations.relay_fuel_transactions
        WHERE operating_company_id = $1::uuid
          AND voided_at IS NULL
          AND COALESCE(relay_created_at, created_at)::date < $2::date
        ORDER BY COALESCE(relay_created_at, created_at)
        LIMIT 25`,
      [USMCA, FLOOR]
    );
    await client.query("ROLLBACK");
    return r.rows.map(
      (x) => `L1: USMCA fill ${x.transaction_id} (${x.id}) dated ${x.fill_day} is before floor ${FLOOR}`
    );
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const floorSrc = fs.readFileSync(path.join(ROOT, FLOOR_FILE), "utf8");
  const cronSrc = fs.readFileSync(path.join(ROOT, CRON), "utf8");

  if (process.argv.includes("--selftest")) {
    const real = staticProblems(floorSrc, cronSrc);
    if (real.length) {
      console.error(`${LABEL} --selftest FAIL — real tree is not green:\n  - ${real.join("\n  - ")}`);
      process.exit(1);
    }
    const plants = [
      ["S1 floor wrong", staticProblems(floorSrc.replace(`"${FLOOR}"`, '"2026-01-01"'), cronSrc), "S1"],
      ["S2 no skip", staticProblems(floorSrc, cronSrc.replace(/isBeforeRelayUsmcaFloor/g, "neverSkipFloor")), "S2"],
      ["S3 no clamp", staticProblems(floorSrc, cronSrc.replace(/clampRelayRangeStartForCompany/g, "noClamp")), "S3"],
    ];
    const missed = plants.filter(([, probs, rule]) => !probs.some((x) => x.startsWith(rule))).map(([n]) => n);
    if (missed.length) {
      console.error(`${LABEL} --selftest FAIL — not caught: ${missed.join("; ")}`);
      process.exit(1);
    }
    console.log(`${LABEL} --selftest PASS — real tree clean; ${plants.length}/${plants.length} plants caught (S1–S3)`);
    process.exit(0);
  }

  const problems = staticProblems(floorSrc, cronSrc);
  const url = process.env.DATABASE_URL;
  if (url) problems.push(...(await liveProblems(url)));
  if (problems.length) {
    console.error(`${LABEL}: FAIL — ${problems.length} issue(s):`);
    for (const x of problems) console.error(`  ✗ ${x}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: OK — USMCA Relay floor ${FLOOR} hardcoded; ingest skips/clamps pre-floor` +
      (url ? `; live: no USMCA fill before ${FLOOR}` : " (static only — no DATABASE_URL)")
  );
}
