#!/usr/bin/env node
/**
 * ROWS 184 / 197 (LEAD 11-03) — the two driver read endpoints stay set-based and day-bounded.
 *
 * 184  GET /api/v1/telematics/driver-day-summary — 5,071 ms in the audit session; 11,247 ms measured on prod
 *      under the app role (EXPLAIN ANALYZE, 2026-11-02). ROOT CAUSE: the arrivals CTE wrapped the whole
 *      STOP_ARRIVAL_EVENTS_SQL derived table (every 'entered' event in history + a per-event audit lateral +
 *      a per-event departure subquery) and filtered to the day only AFTER the DISTINCT ON; under RLS the planner
 *      estimated the fences as 1 row and seq-scanned geo.geofence_events 843 times (8.7M rows filtered) = 11,141 ms.
 *      Mileage probed every historical assignment once per GPS point (8,261 probes).
 *      Required: no ${STOP_ARRIVAL_EVENTS_SQL} in the day summary; the day's entered events are bounded by the
 *      day window; the stop<->fence map is materialised once; the first-ever rule is a NOT EXISTS probe;
 *      mileage joins day-bounded assignments.
 * 197  GET /api/v1/mdata/drivers — 4,522 ms in the audit session; its SQL measures 1.0 ms on prod. ROOT CAUSE:
 *      a separate pool checkout just to resolve the company, then another for the list (5-connection pool).
 *      Required: the non-movement path is ONE withCurrentUser transaction that resolves the company inside it;
 *      the identity.users language lookup is one lateral, not two identical correlated subqueries.
 *
 * --selftest plants each old slow pattern back in memory and must catch every one.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-endpoints-set-based";
const SUMMARY_FILE = "apps/backend/src/telematics/driver-day-summary.routes.ts";
const DRIVERS_FILE = "apps/backend/src/mdata/drivers.routes.ts";

function between(src, startNeedle, endNeedle) {
  const i = src.indexOf(startNeedle);
  if (i < 0) return "";
  const j = src.indexOf(endNeedle, i + startNeedle.length);
  return src.slice(i, j < 0 ? undefined : j);
}

export function findSummaryDefects(src) {
  const out = [];
  const sql = between(src, "const DRIVER_DAY_SUMMARY_SQL = `", "`;");
  if (!sql) return ["DRIVER_DAY_SUMMARY_SQL not found"];
  if (/\$\{STOP_ARRIVAL_EVENTS_SQL\}/.test(sql)) out.push("day summary materialises STOP_ARRIVAL_EVENTS_SQL (every arrival in history) and filters after");
  const entries = between(sql, "day_entries AS MATERIALIZED (", "\n          ),");
  if (!entries) out.push("day_entries (day-bounded entered events, MATERIALIZED) missing");
  else {
    if (!/ge\.occurred_at >= b\.day_start/.test(entries) || !/ge\.occurred_at < b\.day_end/.test(entries)) out.push("day_entries is not bounded to the day window");
    if (!/ge\.event_kind = 'entered'/.test(entries)) out.push("day_entries does not restrict to 'entered'");
    if (/audit\.audit_events|LEFT JOIN LATERAL/.test(entries)) out.push("day_entries carries a per-event lateral (audit/confirm) the summary never reads");
  }
  if (!/stop_fences AS MATERIALIZED \(/.test(sql)) out.push("stop<->fence map is not materialised once (label regex would run per candidate)");
  const arrivals = between(sql, "arrivals AS (", "all_drivers AS (");
  if (!/NOT EXISTS \(/.test(arrivals) || !/x\.occurred_at < sa\.triggered_at/.test(arrivals)) out.push("first-ever-arrival rule is not a NOT EXISTS earlier-entry probe");
  if (/\(SELECT min\(x\.occurred_at\)/.test(sql)) out.push("per-event departure subquery is back in the day summary");
  const assignments = between(sql, "day_assignments AS MATERIALIZED (", "\n          ),");
  if (!assignments || !/a\.started_at < b\.day_end/.test(assignments) || !/a\.ended_at > b\.day_start/.test(assignments)) out.push("mileage assignments are not pre-bounded to the day");
  if (/JOIN telematics\.vehicle_driver_assignments a\s+ON a\.operating_company_id = \$1::uuid\s+AND a\.unit_id = p\.unit_id/.test(sql)) out.push("mileage probes every historical assignment per GPS point");
  return out;
}

export function findDriversDefects(src) {
  const out = [];
  const start = src.indexOf('app.get("/api/v1/mdata/drivers",');
  if (start < 0) return ["GET /api/v1/mdata/drivers handler not found"];
  const end = src.indexOf('app.get("/api/v1/mdata/drivers/me"', start);
  const handler = src.slice(start, end < 0 ? undefined : end);
  const movement = between(handler, "if (useMovementActive) {", "\n    }\n");
  const outsideMovement = handler.replace(movement, "");
  const checkouts = (outsideMovement.match(/withCurrentUser\(/g) ?? []).length;
  if (checkouts !== 1) out.push(`non-movement path takes ${checkouts} withCurrentUser checkouts (must be exactly 1)`);
  const listTxn = outsideMovement.slice(outsideMovement.indexOf("withCurrentUser("));
  if (!/resolveOperatingCompanyId\(client, authUser\.uuid, operating_company_id\)/.test(listTxn.slice(0, 400))) out.push("company is not resolved inside the list transaction");
  const dupLang = (handler.match(/\(SELECT iu\.preferred_language FROM identity\.users iu WHERE iu\.id = mdata\.drivers\.identity_user_id\)/g) ?? []).length;
  if (dupLang > 1) out.push(`identity.users language lookup runs ${dupLang}x per row (must be one lateral)`);
  return out;
}

const summary = readFileSync(path.join(ROOT, SUMMARY_FILE), "utf8");
const drivers = readFileSync(path.join(ROOT, DRIVERS_FILE), "utf8");

if (process.argv.includes("--selftest")) {
  const oldArrivals =
    "          arrivals AS (\n            SELECT sa.driver_id, count(*)::int AS on_time_arrivals, 0 AS late_arrivals\n" +
    "            FROM (${STOP_ARRIVAL_EVENTS_SQL}) sa\n            CROSS JOIN bounds b\n" +
    "            WHERE sa.operating_company_id = $1::uuid AND sa.triggered_at >= b.day_start\n            GROUP BY sa.driver_id\n          ),\n";
  const summaryPlants = [
    [
      "arrivals over STOP_ARRIVAL_EVENTS_SQL (unbounded history)",
      summary.slice(0, summary.indexOf("          stop_fences AS MATERIALIZED (")) + oldArrivals + summary.slice(summary.indexOf("          all_drivers AS (")),
    ],
    // ROW 124 (CC-2 11-13): day_geofence_ids also has the same day bounds; use a replace
    // string that spans the JOIN stop_fences line (unique to day_entries) so .replace() doesn't
    // consume the first occurrence from day_geofence_ids and silently skip day_entries.
    ["day_entries unbounded", summary.replace(
      "JOIN stop_fences sf ON sf.geofence_id = ge.geofence_id\n            WHERE ge.operating_company_id = $1::uuid\n              AND ge.event_kind = 'entered'\n              AND ge.occurred_at >= b.day_start\n              AND ge.occurred_at < b.day_end",
      "JOIN stop_fences sf ON sf.geofence_id = ge.geofence_id\n            WHERE ge.operating_company_id = $1::uuid\n              AND ge.event_kind = 'entered'",
    )],
    ["stop_fences not materialised", summary.replace("stop_fences AS MATERIALIZED (", "stop_fences AS (")],
    ["first-ever probe removed", summary.replace("AND x.occurred_at < sa.triggered_at", "AND x.occurred_at <= sa.triggered_at - interval '0'")],
    [
      "mileage per-point historical probe",
      summary.replace(
        "JOIN day_assignments a\n              ON a.unit_id = p.unit_id",
        "JOIN telematics.vehicle_driver_assignments a\n              ON a.operating_company_id = $1::uuid\n             AND a.unit_id = p.unit_id",
      ),
    ],
  ];
  const driversPlants = [
    [
      "separate resolve checkout",
      drivers.replace(
        "    let movementActiveDriverIds: string[] | null = null;\n",
        "    const resolvedEarly = await withCurrentUser(authUser.uuid, (client) =>\n      resolveOperatingCompanyId(client, authUser.uuid, operating_company_id),\n    );\n    let movementActiveDriverIds: string[] | null = null;\n",
      ),
    ],
    [
      "resolve moved out of list txn",
      drivers.replace(
        "      const scopedCompanyId = await resolveOperatingCompanyId(client, authUser.uuid, operating_company_id);\n      if (!scopedCompanyId) return null;\n      const values: unknown[] = [];",
        "      const scopedCompanyId = operating_company_id as string;\n      const values: unknown[] = [];",
      ),
    ],
    [
      "duplicated identity.users subquery",
      drivers.replace(
        "COALESCE(driver_lang.preferred_language, 'en') AS preferred_language,\n            COALESCE(mdata.drivers.preferred_languages, ARRAY[COALESCE(driver_lang.preferred_language, 'en')]::text[]) AS preferred_languages,",
        "COALESCE((SELECT iu.preferred_language FROM identity.users iu WHERE iu.id = mdata.drivers.identity_user_id), 'en') AS preferred_language,\n            COALESCE(mdata.drivers.preferred_languages, ARRAY[COALESCE((SELECT iu.preferred_language FROM identity.users iu WHERE iu.id = mdata.drivers.identity_user_id), 'en')]::text[]) AS preferred_languages,",
      ),
    ],
  ];
  let caught = 0;
  const total = summaryPlants.length + driversPlants.length;
  for (const [name, planted] of summaryPlants) {
    const hit = planted !== summary && findSummaryDefects(planted).length > 0;
    console.log(`${hit ? "ok  " : "MISS"}  plant: ${name}`);
    if (hit) caught++;
  }
  for (const [name, planted] of driversPlants) {
    const hit = planted !== drivers && findDriversDefects(planted).length > 0;
    console.log(`${hit ? "ok  " : "MISS"}  plant: ${name}`);
    if (hit) caught++;
  }
  const cleanOk = findSummaryDefects(summary).length === 0 && findDriversDefects(drivers).length === 0;
  console.log(`${cleanOk ? "ok  " : "MISS"}  live tree is clean`);
  console.log(`${LABEL} SELFTEST: ${caught}/${total} planted defects caught${cleanOk ? "" : " (live tree NOT clean)"}`);
  process.exit(caught === total && cleanOk ? 0 : 1);
}

const defects = [...findSummaryDefects(summary).map((d) => `${SUMMARY_FILE}: ${d}`), ...findDriversDefects(drivers).map((d) => `${DRIVERS_FILE}: ${d}`)];
if (defects.length) {
  console.error(`${LABEL} FAIL:\n - ${defects.join("\n - ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — day summary is day-bounded and set-based; /mdata/drivers resolves + lists in one checkout`);
