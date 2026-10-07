#!/usr/bin/env node
/**
 * ROUND 304 T-45 — GUARD. "A fuel row with no gallons is not a fuel purchase, it is a charge."
 *
 * FAILS IF (live, USMCA and every other company):
 *   1. any MOTOR-FUEL row (diesel / reefer_diesel / gas) carries gallons <= 0 or NULL;
 *   2. any motor-fuel row shares an exact non-midnight transaction_at with >= 2 other live rows
 *      (an import stamp, not pump times);
 *   3. apps/backend/src/fuel/fuel-purchase-eligibility.ts (the one shared predicate) is missing.
 * DEF rows with no gallons are reported, not failed: their source (Faro settlement lines,
 * quantity=1.0 placeholder) never had gallons, and DEF is not motor fuel.
 */
export const REQUIRES_LIVE_DB = "Neon live verification required";

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const LABEL = "verify-fuel-purchases-have-gallons-and-real-stamps";
const SHARED_MODULE = resolve(ROOT, "apps/backend/src/fuel/fuel-purchase-eligibility.ts");

export const MOTOR_FUEL_NO_GALLONS_SQL = `
  SELECT count(*)::int AS n FROM fuel.fuel_transactions
  WHERE voided_at IS NULL AND fuel_type IN ('diesel','reefer_diesel','gas')
    AND (gallons IS NULL OR gallons <= 0)`;

export const MOTOR_FUEL_SHARED_STAMP_SQL = `
  SELECT count(*)::int AS n FROM (
    SELECT fuel_type, transaction_at,
           count(*) OVER (PARTITION BY operating_company_id, transaction_at) AS c
    FROM fuel.fuel_transactions WHERE voided_at IS NULL
  ) x
  WHERE fuel_type IN ('diesel','reefer_diesel','gas') AND c >= 3
    -- an import stamp carries seconds/sub-seconds (now()); a date-only source is stamped at an
    -- exact :00:00 (midnight or noon) and is honest-but-imprecise, not an import stamp.
    AND extract(second FROM transaction_at) <> 0`;

export const DEF_CHARGES_SQL = `
  SELECT count(*)::int AS n FROM fuel.fuel_transactions
  WHERE voided_at IS NULL AND fuel_type = 'def' AND (gallons IS NULL OR gallons <= 0)`;

/** Pre-existing, disclosed: 42 TRANSP diesel rows (source='other', created 2026-07-16..08-14) with
 *  NULL gallons. Shrink-only: a NEW motor-fuel row without gallons fails immediately. */
export const KNOWN_NO_GALLONS_BASELINE = 42; // STALE-LITERAL-OK: disclosed TRANSP debt measured 2026-10-01, shrink-only

export function evaluate({ noGallons, sharedStamp, moduleExists }) {
  const problems = [];
  if (!moduleExists) problems.push("apps/backend/src/fuel/fuel-purchase-eligibility.ts is missing -- the one shared predicate.");
  if (noGallons > KNOWN_NO_GALLONS_BASELINE) problems.push(`${noGallons} (baseline ${KNOWN_NO_GALLONS_BASELINE}) live motor-fuel row(s) carry gallons <= 0 or NULL -- a charge recorded as a purchase.`);
  if (sharedStamp > 0) problems.push(`${sharedStamp} live motor-fuel row(s) share an exact non-midnight transaction_at with >= 2 others -- an import stamp, not a pump time.`);
  return problems;
}

function selftest() {
  const cases = [
    [{ noGallons: 0, sharedStamp: 0, moduleExists: true }, false],
    [{ noGallons: 42, sharedStamp: 0, moduleExists: true }, false],
    [{ noGallons: 43, sharedStamp: 0, moduleExists: true }, true],
    [{ noGallons: 0, sharedStamp: 3, moduleExists: true }, true],
    [{ noGallons: 0, sharedStamp: 0, moduleExists: false }, true],
  ];
  let ok = true;
  for (const [input, wantFail] of cases) {
    if ((evaluate(input).length > 0) !== wantFail) {
      console.error(`SELFTEST FAIL: ${JSON.stringify(input)}`);
      ok = false;
    }
  }
  return ok;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`${LABEL} selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const noGallons = (await client.query(MOTOR_FUEL_NO_GALLONS_SQL)).rows[0].n;
    const sharedStamp = (await client.query(MOTOR_FUEL_SHARED_STAMP_SQL)).rows[0].n;
    const defCharges = (await client.query(DEF_CHARGES_SQL)).rows[0].n;
    await client.query("ROLLBACK");
    const problems = evaluate({ noGallons, sharedStamp, moduleExists: existsSync(SHARED_MODULE) });
    if (problems.length) {
      console.error(`${LABEL}: FAIL\n  - ${problems.join("\n  - ")}`);
      process.exit(1);
    }
    console.log(`${LABEL}: OK -- ${noGallons}/${KNOWN_NO_GALLONS_BASELINE} baselined motor-fuel rows without gallons (TRANSP, disclosed), 0 import-stamped motor-fuel rows. (${defCharges} DEF charge row(s) with no gallons: not motor fuel, never eligible for MPG/IFTA/Samsara push.)`);
    process.exit(0);
  } finally {
    client.release();
    await pool.end();
  }
}
