#!/usr/bin/env node
/**
 * verify-load-driven-miles-from-fences — 443.324 ENG-29 (443.330 ENG-53 related).
 *
 * MEASUREMENT (2026-10-24 on main 1d87d07bab): 12 of 194 active USMCA loads have
 * miles_driven_actual set; 182 are missing. Remeasured LIVE 11-02 CT: **149** missing
 * (45 filled). Remeasured LIVE 11-12 CT: **135** missing (ENG-53 stop-event relearn wired).
 * Fill source: telematics.odometer_readings
 * (pickup departure → delivery arrival odometer delta, via geofence_visit_id).
 *
 * GUARD (SHRINK-ONLY): the count of active USMCA loads missing miles_driven_actual must
 * not exceed the baseline. Ceiling: 135. Each fence-filled backfill reduces the count.
 * Loads without fence evidence are listed with their reason from miles_driven_actual_reason;
 * never estimated (miles_driven_actual stays NULL).
 *
 * Usage: node scripts/verify-load-driven-miles-from-fences.mjs [--selftest]
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-load-driven-miles-from-fences";
export const REQUIRES_LIVE_DB = "actual driven miles are a live telematics measurement — fails closed without a database";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const BASELINE = 135; // LIVE 11-12 CT (ENG-53 relearn wired); was 149 (11-02); was 182 (10-24); shrink-only

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
    `SELECT l.id::text, l.load_number, l.miles_driven_actual_reason
       FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid
        AND l.miles_driven_actual IS NULL
        AND l.voided_at IS NULL
        AND l.status NOT IN ('cancelled','voided')
      ORDER BY l.id`,
    [USMCA]
  );

  await client.query("COMMIT");

  const missing = res.rows.length;

  if (shrinkFails(missing)) {
    console.error(
      `${LABEL}: FAIL — ${missing} active USMCA loads missing miles_driven_actual (baseline ${BASELINE}); count grew. ` +
      `Fill from telematics.odometer_readings (pickup departure → delivery arrival odometer delta).`
    );
    for (const row of res.rows.slice(0, 20)) {
      console.error(`  load ${row.load_number ?? row.id}: ${row.miles_driven_actual_reason ?? "not yet computed"}`);
    }
    if (missing > 20) console.error(`  … and ${missing - 20} more`);
    process.exit(1);
  }

  console.log(
    `${LABEL}: OK — ${missing} of 194 USMCA loads missing miles_driven_actual ` +
    `(baseline ${BASELINE}; shrink-only).`
  );
  if (missing > 0 && process.env.VERBOSE_MISSING_MILES === "1") {
    for (const row of res.rows) {
      console.log(`  load ${row.load_number ?? row.id}: ${row.miles_driven_actual_reason ?? "not yet computed"}`);
    }
  }
} finally {
  client.release?.();
  await pool?.end?.();
}
