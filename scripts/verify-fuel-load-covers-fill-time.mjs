#!/usr/bin/env node
/**
 * LEAD 443.214 (CC-2) — LIVE: a fuel fill sits on the load its truck was running at the pump (or, running empty, the
 * load it drove to). Owner 10-21: "all wex transactions should be linked to a load, use samsara locations ... check dates".
 *  (a) every fill the engine resolved by GPS (truck_resolution gps*) is on a load of that GPS truck (assigned_unit_id =
 *      gps_unit_id) — owner rulings excepted (recorded "owner_ruling: <reason>");
 *  (b) that load's window covers the provider moment (first pickup ≤ moment ≤ last delivery; actual stamps, else the
 *      appointment / schedule; a date-only stamp counts through its day) — or, an empty move, the load picks up after it;
 *  (c) no Relay fill is marked time_unknown while its Relay record carries the real moment (relay_created_at).
 * --static: pure SQL-shape self-check only (CI's live job runs the real counts). --selftest plants each violation.
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "live counts: GPS-resolved fill/load window and Relay fill time; no offline mode";
const LABEL = "verify-fuel-load-covers-fill-time";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
export const VIOLATIONS_SQL = `
  WITH f AS (
    SELECT ft.id, ft.load_id, ft.gps_unit_id, ft.fill_moment_at, ft.truck_resolution
      FROM fuel.fuel_transactions ft
     WHERE ft.operating_company_id = $1::uuid AND ft.voided_at IS NULL
       AND ft.fill_moment_at IS NOT NULL AND ft.gps_unit_id IS NOT NULL
       AND ft.truck_resolution LIKE 'gps%'
  ), w AS (
    SELECT f.*, l.assigned_unit_id, l.load_number,
           (SELECT min(COALESCE(s.actual_arrival_at, s.appointment_start_at, s.scheduled_arrival_at)) FROM mdata.load_stops s
             WHERE s.load_id = l.id AND s.stop_type::text = 'pickup' AND s.soft_deleted_at IS NULL) AS pickup_at,
           (SELECT max(CASE WHEN (x.t AT TIME ZONE 'America/Chicago')::time = time '00:00' THEN x.t + interval '1 day' - interval '1 microsecond' ELSE x.t END)
              FROM (SELECT COALESCE(s.actual_departure_at, s.actual_arrival_at, s.appointment_end_at, s.appointment_start_at, s.scheduled_arrival_at) AS t
                      FROM mdata.load_stops s WHERE s.load_id = l.id AND s.stop_type::text = 'delivery' AND s.soft_deleted_at IS NULL) x) AS finish_at
      FROM f LEFT JOIN mdata.loads l ON l.id = f.load_id
  )
  SELECT 'wrong_truck' AS kind, w.id::text, w.load_number::text FROM w WHERE w.assigned_unit_id IS DISTINCT FROM w.gps_unit_id
  UNION ALL
  SELECT 'window', w.id::text, w.load_number::text FROM w
   WHERE w.assigned_unit_id = w.gps_unit_id
     AND NOT ((w.pickup_at <= w.fill_moment_at AND w.fill_moment_at <= w.finish_at) OR w.fill_moment_at < w.pickup_at)
  UNION ALL
  SELECT 'relay_time_unknown', ft.id::text, NULL FROM fuel.fuel_transactions ft
    JOIN integrations.relay_fuel_transactions r ON r.id = ft.relay_fuel_transaction_id
   WHERE ft.operating_company_id = $1::uuid AND ft.voided_at IS NULL AND ft.time_unknown AND r.relay_created_at IS NOT NULL`;

export function staticProblems(sql = VIOLATIONS_SQL) {
  const p = [];
  if (!/truck_resolution LIKE 'gps%'/.test(sql)) p.push("the live check no longer limits itself to GPS-resolved fills (owner rulings would be judged)");
  if (!/w\.assigned_unit_id IS DISTINCT FROM w\.gps_unit_id/.test(sql)) p.push("(a) wrong-truck check missing");
  if (!/w\.pickup_at <= w\.fill_moment_at AND w\.fill_moment_at <= w\.finish_at\) OR w\.fill_moment_at < w\.pickup_at/.test(sql)) p.push("(b) window check missing");
  if (!/ft\.time_unknown AND r\.relay_created_at IS NOT NULL/.test(sql)) p.push("(c) Relay placeholder check missing");
  return p;
}

if (process.argv.includes("--selftest")) {
  const plants = [
    ["drops (a)", VIOLATIONS_SQL.replace("w.assigned_unit_id IS DISTINCT FROM w.gps_unit_id", "false")],
    ["drops (b)", VIOLATIONS_SQL.replace("OR w.fill_moment_at < w.pickup_at", "OR true")],
    ["drops (c)", VIOLATIONS_SQL.replace("ft.time_unknown AND r.relay_created_at IS NOT NULL", "false")],
    ["judges owner rulings", VIOLATIONS_SQL.replace("AND ft.truck_resolution LIKE 'gps%'", "")],
  ];
  let ok = 0;
  if (staticProblems().length) { console.error(`${LABEL} --selftest: real SQL not clean`); process.exit(1); }
  for (const [name, sql] of plants) { const pass = staticProblems(sql).length > 0; console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`); if (pass) ok++; }
  console.log(`${LABEL} --selftest ${ok}/${plants.length}`);
  process.exit(ok === plants.length ? 0 : 1);
}
const sp = staticProblems();
if (sp.length) { for (const x of sp) console.error(`  ✗ ${x}`); process.exit(1); }
if (process.argv.includes("--static")) { console.log(`${LABEL}: STATIC ONLY; live count required in CI`); process.exit(0); }
const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const rows = (await client.query(VIOLATIONS_SQL, [USMCA])).rows;
  await client.query("ROLLBACK");
  if (rows.length) {
    console.error(`${LABEL}: LIVE FAIL — ${rows.length} fill(s):`);
    for (const r of rows.slice(0, 40)) console.error(`  ✗ ${r.kind}: fuel ${String(r.id).slice(0, 8)} load ${r.load_number ?? "(none)"}`);
    process.exitCode = 1;
  } else console.log(`${LABEL}: LIVE PASS — every GPS-resolved fill is on its GPS truck's load covering the pump moment; no Relay fill without its time`);
} finally { client.release(); await pool.end(); }
