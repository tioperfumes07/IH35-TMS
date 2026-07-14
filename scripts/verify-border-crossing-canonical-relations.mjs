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

  // ── detector job: must read the canonical positions table + its real columns ──
  if (!/integrations\.samsara_vehicle_positions\b/.test(j))
    errs.push(`${DETECTOR_JOB}: must read FROM integrations.samsara_vehicle_positions`);
  for (const col of ["unit_uuid", "recorded_at"]) {
    if (!new RegExp(`\\b${col}\\b`).test(j))
      errs.push(`${DETECTOR_JOB}: missing canonical column ${col}`);
  }
  // phantom columns from the old query must be gone from the positions SELECT
  for (const bad of ["occurred_at", "latitude", "longitude"]) {
    if (new RegExp(`\\b${bad}\\b`).test(j))
      errs.push(`${DETECTOR_JOB}: phantom column ${bad} still present (samsara_vehicle_positions has recorded_at/lat/lng)`);
  }

  // ── detector service: must resolve the active load via the canonical unit->load column ──
  if (!/assigned_unit_id/.test(s))
    errs.push(`${DETECTOR_SVC}: must resolve the active load via mdata.loads.assigned_unit_id`);
  // load PK is mdata.loads.id — the original l.uuid was itself phantom
  if (/\bl\.uuid\b/.test(s))
    errs.push(`${DETECTOR_SVC}: mdata.loads has no uuid column — select l.id (the real PK)`);

  return errs;
}

function selftest() {
  const goodJob = `SELECT DISTINCT ON (unit_uuid) unit_uuid, operating_company_id, lat, lng, recorded_at::text
    FROM integrations.samsara_vehicle_positions WHERE recorded_at >= now() ORDER BY unit_uuid, recorded_at DESC`;
  const goodSvc = `SELECT l.id FROM mdata.loads l WHERE l.assigned_unit_id = $1::uuid AND l.soft_deleted_at IS NULL`;

  const cases = [
    { n: "canonical job + svc → 0", in: { job: goodJob, svc: goodSvc }, want: 0 },
    { n: "phantom samsara_positions in job → flag", in: { job: goodJob.replace("integrations.samsara_vehicle_positions", "integrations.samsara_positions"), svc: goodSvc }, min: 1 },
    { n: "phantom load_assignments in svc → flag", in: { job: goodJob, svc: `JOIN mdata.load_assignments la ON la.load_uuid = l.uuid` }, min: 1 },
    { n: "phantom column occurred_at in job → flag", in: { job: goodJob.replace("recorded_at::text", "occurred_at::text"), svc: goodSvc }, min: 1 },
    { n: "phantom l.uuid in svc → flag", in: { job: goodJob, svc: `SELECT l.uuid FROM mdata.loads l WHERE l.assigned_unit_id = $1` }, min: 1 },
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
console.log(`[${LABEL}] OK — border-crossing detector reads integrations.samsara_vehicle_positions and resolves the active load via mdata.loads.assigned_unit_id.`);
