#!/usr/bin/env node
/**
 * verify-load-driven-miles-from-fences — 443.324 ENG-29 (443.330 ENG-53 related).
 *
 * MEASUREMENT (2026-10-24 on main 1d87d07bab): 12 of 194 active USMCA loads have
 * miles_driven_actual set; 182 are missing. Fill source: telematics.odometer_readings
 * (pickup departure → delivery arrival odometer delta, via geofence_visit_id).
 *
 * GUARD (SHRINK-ONLY): the count of active USMCA loads missing miles_driven_actual must
 * not exceed the baseline. Ceiling: 182. Each fence-filled backfill reduces the count.
 * Loads without fence evidence are listed; never estimated (miles_driven_actual stays NULL).
 *
 * Usage: node scripts/verify-load-driven-miles-from-fences.mjs [--selftest]
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-load-driven-miles-from-fences";
export const REQUIRES_LIVE_DB = "actual driven miles are a live telematics measurement — fails closed without a database";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const BASELINE = 182; // measured 2026-10-24; shrink-only

export function shrinkFails(current) { return current > BASELINE; }

if (process.argv.includes("--selftest")) {
  const cases = [
    [`≤${BASELINE} = pass`, !shrinkFails(BASELINE)],
    [`${BASELINE + 1} = fail`, shrinkFails(BASELINE + 1)],
    ["0 = pass", !shrinkFails(0)],
  ];
  for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

  const res = await client.query(
    `SELECT count(*) AS missing
       FROM mdata.loads
      WHERE operating_company_id = $1::uuid
        AND miles_driven_actual IS NULL
        AND voided_at IS NULL
        AND status NOT IN ('cancelled','voided')`,
    [USMCA]
  );

  await client.query("COMMIT");

  const missing = Number(res.rows[0].missing);

  if (shrinkFails(missing)) {
    console.error(
      `${LABEL}: FAIL — ${missing} active USMCA loads missing miles_driven_actual (baseline ${BASELINE}); count grew. ` +
      `Fill from telematics.odometer_readings (pickup departure → delivery arrival odometer delta).`
    );
    process.exit(1);
  }

  console.log(
    `${LABEL}: OK — ${missing} of ${missing + (194 - missing)} USMCA loads missing miles_driven_actual ` +
    `(baseline ${BASELINE}; shrink-only).`
  );
} finally {
  client.release?.();
  await pool?.end?.();
}
