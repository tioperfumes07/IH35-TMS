#!/usr/bin/env node
/**
 * verify-step 12029 -- ORDERS 2026-10-01 CC-1 row 4 (E-17 fleet roster).
 *
 * Measured 2026-10-01 (ROUND 305 A-45, OUTBOX-CC-1): 43 unit rows attached to USMCA, 15 reporting GPS,
 * 24 dark, 1 sample, 3 that NEVER reported -- and 7 "InService" rows dark 4 days to 2.2 years, which
 * poison every per-unit average. The existing roster is the owner's to reclassify; this guard stops the
 * roster from getting worse:
 *
 *   FAIL on any USMCA unit created on/after 2026-10-01, older than a 72 h device-install grace, that has
 *   NEVER reported GPS (no telematics.vehicle_locations row) and is not deactivated WITH a written reason
 *   (status_change_reason). Sample rows (is_sample_data) are out of scope.
 *
 * Going-forward only: the 43 existing rows are reported, not failed -- the owner decides them. Read-only;
 * this guard never deactivates anything. Runs inside a rolled-back transaction so the RLS bypass holds,
 * with the completeness discriminator on mdata.units (a 0 is never a verdict on its own).
 */
/** MATRIX-BUILT-OPTIONAL — live-only / invariant ratchet guard; no surface wiring leaf to register. */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-new-units-have-gps-or-deactivation-reason";
export const REQUIRES_LIVE_DB = "live-only guard: reads production database (USMCA) and cannot be statically verified; run by money-pr-local-gate with DATABASE_URL";
export const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
export const GOING_FORWARD_FROM = "2026-10-01T00:00:00-05:00";
export const DEVICE_GRACE_HOURS = 72;

/** Pure: the violation for one row, or null. */
export function newUnitViolation(row) {
  if (row.has_gps) return null;
  const reason = typeof row.status_change_reason === "string" ? row.status_change_reason.trim() : "";
  if (row.deactivated_at && reason) return null;
  if (row.deactivated_at && !reason) return `${row.unit_number}: deactivated with NO reason and never reported GPS`;
  return `${row.unit_number}: never reported GPS and is not deactivated (created ${row.created_at})`;
}

function selftest() {
  const cases = [
    [{ unit_number: "T200", has_gps: true, deactivated_at: null, status_change_reason: null }, false],
    [{ unit_number: "T201", has_gps: false, deactivated_at: null, status_change_reason: null, created_at: "2026-10-02" }, true],
    [{ unit_number: "T202", has_gps: false, deactivated_at: "2026-10-05", status_change_reason: "sold" }, false],
    [{ unit_number: "T203", has_gps: false, deactivated_at: "2026-10-05", status_change_reason: "  " }, true],
  ];
  let ok = true;
  for (const [row, wantFail] of cases) {
    if ((newUnitViolation(row) !== null) !== wantFail) {
      console.error(`SELFTEST FAIL: ${row.unit_number} expected ${wantFail ? "violation" : "clean"}`);
      ok = false;
    }
  }
  console.log(ok ? `${LABEL} --selftest PASS (4/4)` : `${LABEL} --selftest FAIL`);
  process.exit(ok ? 0 : 1);
}

async function run() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const disc = await client.query(
      `SELECT (SELECT count(*) FROM mdata.units)::bigint AS visible,
              (SELECT n_live_tup FROM pg_stat_user_tables WHERE schemaname = 'mdata' AND relname = 'units')::bigint AS live`
    );
    const { visible, live } = disc.rows[0];
    if (Number(visible) === 0 || (Number(live) > 0 && Number(visible) < Number(live) * 0.9)) {
      console.error(`${LABEL}: FAIL -- mdata.units visible=${visible} vs n_live_tup=${live}: RLS is hiding rows, a 0 here would be a lie.`);
      process.exitCode = 1;
      return;
    }
    const { rows } = await client.query(
      `SELECT u.unit_number, u.created_at::text, u.deactivated_at::text, u.status_change_reason,
              EXISTS (SELECT 1 FROM telematics.vehicle_locations vl WHERE vl.unit_id = u.id) AS has_gps
         FROM mdata.units u
        WHERE (u.currently_leased_to_company_id = $1::uuid
               OR (u.currently_leased_to_company_id IS NULL AND u.owner_company_id = $1::uuid))
          AND COALESCE(u.is_sample_data, false) = false
          AND u.created_at >= $2::timestamptz
          AND u.created_at < now() - make_interval(hours => $3)
        ORDER BY u.unit_number`,
      [USMCA, GOING_FORWARD_FROM, DEVICE_GRACE_HOURS]
    );
    const violations = rows.map(newUnitViolation).filter(Boolean);
    if (violations.length) {
      console.error(`${LABEL}: FAIL -- ${violations.length} new unit(s) with no GPS and no deactivation reason:\n  - ${violations.join("\n  - ")}`);
      process.exitCode = 1;
      return;
    }
    console.log(`${LABEL}: OK -- ${rows.length} USMCA unit(s) created since ${GOING_FORWARD_FROM} past the ${DEVICE_GRACE_HOURS} h grace; every one has GPS or a deactivation reason (mdata.units visible=${visible}/${live}).`);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
    await pool.end();
  }
}

if (process.argv.includes("--selftest")) selftest();
else await run();
