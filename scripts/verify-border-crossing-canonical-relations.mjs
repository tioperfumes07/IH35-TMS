#!/usr/bin/env node
/**
 * BORDER-CROSSING-PHANTOM guard — the in-process border-crossing detector cron threw 42P01 on EVERY
 * tick (caught by the job runner, so no 500, but the feature was 100% dead and logged forever). Two
 * phantom relations were the cause; a third phantom column (mdata.loads.uuid) was found in the same
 * fix:
 *   1. jobs/border-crossing-detector.ts read FROM integrations.samsara_positions — NO SUCH TABLE.
 *      Real table: integrations.samsara_vehicle_positions (migration 202606080214), columns
 *      unit_uuid / lat / lng / recorded_at (NOT vehicle_id / latitude / longitude / occurred_at).
 *   2. border-crossings/detector.service.ts JOINed mdata.load_assignments (NO SUCH TABLE) to resolve
 *      unit -> active load. Canonical resolution is mdata.loads.assigned_unit_id (verified against
 *      the same pattern in telematics/hos.routes.ts + telematics/geofence-detector.service.ts), and
 *      the load PK is mdata.loads.id (NOT l.uuid — a third phantom in the original query).
 *
 * This guard FAILS the build if either phantom relation, or the phantom columns, reappear in those two
 * files, and asserts the canonical names are present. Comments are stripped before scanning so this
 * doc block does not trip it.
 *
 * --selftest exercises assertGuard() against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-border-crossing-canonical-relations";

const DETECTOR_JOB = "apps/backend/src/jobs/border-crossing-detector.ts";
const DETECTOR_SVC = "apps/backend/src/integrations/samsara/border-crossings/detector.service.ts";

/** Strip block + line comments so intentional documentation of the fix does not trip the guard. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1);
}

/**
 * @param {{ job: string, svc: string }} sources — raw file contents.
 * @returns {string[]} failures (empty = pass).
 */
export function assertGuard({ job, svc }) {
  const errs = [];
  const j = stripComments(job);
  const s = stripComments(svc);

  // ── Phantom relations must never reappear in either file ──
  for (const [name, code] of [["border-crossing-detector.ts", j], ["detector.service.ts", s]]) {
    if (/integrations\.samsara_positions\b/.test(code))
      errs.push(`${name}: phantom relation integrations.samsara_positions (real: integrations.samsara_vehicle_positions)`);
    if (/mdata\.load_assignments\b/.test(code))
      errs.push(`${name}: phantom relation mdata.load_assignments (resolve unit->load via mdata.loads.assigned_unit_id)`);
  }

  // ── E-29 (2026-10-01): crossings are projected from the canonical fence events, never a second
  //    position-based inside/outside decision ──
  if (!/geo\.geofence_events/.test(s))
    errs.push(`${DETECTOR_SVC}: must project crossings from geo.geofence_events`);
  if (/BORDER_GEOFENCES|findGeofenceForPosition|haversine/i.test(s))
    errs.push(`${DETECTOR_SVC}: a hard-coded border geofence / distance check is back (second inside decider)`);
  // ── detector service: must resolve the active load via the canonical unit->load column ──
  // The load at the crossing comes from the shared loadAtTimeSql (which keys on mdata.loads.assigned_unit_id).
  if (!/loadAtTimeSql\(/.test(s) && !/assigned_unit_id/.test(s))
    errs.push(`${DETECTOR_SVC}: must resolve the load via the shared loadAtTimeSql (mdata.loads.assigned_unit_id)`);
  // load PK is mdata.loads.id — the original l.uuid was itself phantom
  if (/\bl\.uuid\b/.test(s))
    errs.push(`${DETECTOR_SVC}: mdata.loads has no uuid column — select l.id (the real PK)`);

  return errs;
}

function selftest() {
  const goodJob = `projectBorderCrossingsFromFenceEvents(client, USMCA_COMPANY_ID, since)`;
  const goodSvc = `FROM geo.geofence_events ge ... SELECT l.id FROM mdata.loads l WHERE l.assigned_unit_id = $1::uuid`;

  const cases = [
    { n: "canonical job + svc → 0", in: { job: goodJob, svc: goodSvc }, want: 0 },
    { n: "phantom samsara_positions in job → flag", in: { job: "FROM integrations.samsara_positions", svc: goodSvc }, min: 1 },
    { n: "phantom load_assignments in svc → flag", in: { job: goodJob, svc: goodSvc + " JOIN mdata.load_assignments la" }, min: 1 },
    { n: "hard-coded geofences in svc → flag", in: { job: goodJob, svc: goodSvc + " BORDER_GEOFENCES" }, min: 1 },
    { n: "phantom l.uuid in svc → flag", in: { job: goodJob, svc: goodSvc + " SELECT l.uuid FROM mdata.loads l" }, min: 1 },
  ];
  let f = 0;
  for (const c of cases) {
    const n = assertGuard(c.in).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.min;
    if (!ok) f++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n})`);
  }
  if (f) { console.error(`\n${LABEL} SELFTEST FAILED: ${f}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

const jobPath = path.join(ROOT, DETECTOR_JOB);
const svcPath = path.join(ROOT, DETECTOR_SVC);
for (const p of [jobPath, svcPath]) {
  if (!fs.existsSync(p)) { console.error(`[${LABEL}] FAILED — missing ${path.relative(ROOT, p)}`); process.exit(1); }
}
const errs = assertGuard({ job: fs.readFileSync(jobPath, "utf8"), svc: fs.readFileSync(svcPath, "utf8") });
if (errs.length) { console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`); for (const e of errs) console.error(`  ✗ ${e}`); process.exit(1); }
console.log(`[${LABEL}] OK — border crossings are projected from geo.geofence_events (no second inside decider) and the active load resolves via mdata.loads.assigned_unit_id.`);
