#!/usr/bin/env node
/**
 * verify-capacity-engine-availability — CAPACITY ENGINE spec §6 (capacity half).
 *
 * The Available Trucks list must say WHERE and WHEN each in-service truck is free, from the canonical sets, and must
 * never invent a value:
 *   1. units come from the canonical in-service gate (UNIT_IN_SERVICE_SQL), not a hand-written status list;
 *   2. the load is the LAST load in the unit's open chain (canonicalDispatchWorkWhereClause, ordered by its final-stop
 *      appointment/scheduled time DESC, LIMIT 1) and the place is that load's FINAL stop (sequence_number DESC);
 *   3. time source order is actual → appointment → scheduled; with no open load, GPS (source 'gps');
 *   4. anything unknown is NULL + a reason, and a row with a reason is never offerable;
 *   5. no inline load-status list in the capacity engine; the routes are registered.
 * Usage: node scripts/verify-capacity-engine-availability.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-capacity-engine-availability";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SVC = "apps/backend/src/dispatch/capacity/capacity.service.ts";
const ROUTES = "apps/backend/src/dispatch/capacity/capacity.routes.ts";
const INDEX = "apps/backend/src/index.ts";

export function check(files) {
  const f = [];
  const svc = files[SVC] ?? "";
  const routes = files[ROUTES] ?? "";
  const index = files[INDEX] ?? "";
  if (!svc) return [`${SVC} missing`];
  if (!/WHERE \$\{UNIT_IN_SERVICE_SQL\}/.test(svc)) f.push("capacity SQL is not gated by WHERE ${UNIT_IN_SERVICE_SQL} (canonical in-service units)");
  if (!/canonicalDispatchWorkWhereClause\("l", "\$1::uuid"\)/.test(svc)) f.push("open-load chain is not the canonical dispatch work set (canonicalDispatchWorkWhereClause)");
  if (!/ORDER BY COALESCE\(last_stop\.appointment_end_at, last_stop\.scheduled_arrival_at\) DESC NULLS LAST[^\n]*\n\s*LIMIT 1/.test(svc)) f.push("chain does not pick the LAST load (final-stop appointment/scheduled DESC, LIMIT 1)");
  if (!/WHERE s\.load_id = chain\.load_uuid[\s\S]{0,120}ORDER BY s\.sequence_number DESC LIMIT 1/.test(svc)) f.push("available place is not the chain load's FINAL stop (sequence_number DESC LIMIT 1)");
  const order = ["r.stop_actual_departure_at", "r.stop_appointment_end_at", "r.stop_scheduled_arrival_at"].map((k) => svc.indexOf(`if (${k})`) >= 0 ? svc.indexOf(`if (${k})`) : svc.indexOf(`else if (${k})`));
  if (order.some((i) => i < 0) || !(order[0] < order[1] && order[1] < order[2])) f.push("time source order is not actual → appointment → scheduled");
  if (!/source = "gps"/.test(svc)) f.push("no GPS fallback (source 'gps') for a truck with no open load");
  if (!/reasons\.push\(/.test(svc) || !/offerable: offerEnabled && reason === null/.test(svc)) f.push("unknown values are not NULL + reason, or a row with a reason can still be offered");
  if (/\bstatus\s+(NOT\s+)?IN\s*\(/i.test(svc)) f.push("inline status list in capacity.service.ts — use the canonical sets");
  if (!/app\.get\("\/api\/v1\/dispatch\/capacity"/.test(routes)) f.push("GET /api/v1/dispatch/capacity route missing");
  if (!/await registerCapacityRoutes\(app\);/.test(index)) f.push("registerCapacityRoutes(app) not registered in index.ts");
  // ROUND 8.12 reverse — capacity returns driver_id so Available Trucks can EntityLink Driver.
  if (!/d\.id::text AS driver_id/.test(svc) || !/driver_id: r\.driver_id/.test(svc)) {
    f.push("capacity SQL/row must select and return driver_id for EntityLink");
  }
  return f;
}

function readAll() {
  const out = {};
  for (const rel of [SVC, ROUTES, INDEX]) {
    const abs = path.join(ROOT, rel);
    out[rel] = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
  }
  return out;
}

function selftest() {
  const live = readAll();
  const cases = [
    ["in-service gate dropped", { ...live, [SVC]: live[SVC].replace("WHERE ${UNIT_IN_SERVICE_SQL}", "WHERE u.deactivated_at IS NULL") }],
    ["first load instead of last", { ...live, [SVC]: live[SVC].replace("last_stop.scheduled_arrival_at) DESC NULLS LAST", "last_stop.scheduled_arrival_at) ASC NULLS LAST") }],
    ["first stop instead of final", { ...live, [SVC]: live[SVC].replace(/(WHERE s\.load_id = chain\.load_uuid[\s\S]{0,120}ORDER BY s\.sequence_number) DESC/, "$1 ASC") }],
    ["scheduled before appointment", { ...live, [SVC]: live[SVC].replace("else if (r.stop_appointment_end_at)", "else if (r.stop_appointment_end_atX)") }],
    ["reason ignored for offerable", { ...live, [SVC]: live[SVC].replace("offerable: offerEnabled && reason === null", "offerable: offerEnabled") }],
    ["inline status list", { ...live, [SVC]: live[SVC] + "\n// x\nconst bad = `l.status IN ('booked')`;" }],
    ["routes not registered", { ...live, [INDEX]: live[INDEX].replace("await registerCapacityRoutes(app);", "") }],
  ];
  let pass = 0;
  if (check(live).length === 0) pass += 1; else console.error(`${LABEL} --selftest: live tree fails`, check(live));
  for (const [name, files] of cases) {
    if (check(files).length > 0) pass += 1; else console.error(`${LABEL} --selftest: did not catch "${name}"`);
  }
  const total = cases.length + 1;
  if (pass !== total) { console.error(`${LABEL} --selftest FAIL ${pass}/${total}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const f = check(readAll());
  if (f.length) { for (const x of f) console.error(`${LABEL}: FAIL — ${x}`); process.exit(1); }
  console.log(`${LABEL}: PASS — in-service units, last load in chain, final stop, actual→appointment→scheduled→GPS, NULL+reason never offered`);
}
