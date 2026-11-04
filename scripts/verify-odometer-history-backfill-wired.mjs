#!/usr/bin/env node
/**
 * E11 / ENG-29 (LEAD 11-03) — a real-driven-miles boundary the odometer anchor could not measure gets Samsara's own reads.
 * Root cause measured 11-03 (prod, USMCA): 148 delivered loads without real miles, 144 refused "odometer not captured"
 * — telematics.vehicle_locations had no odometer 2026-08-27 … 09-29 and nothing stored Samsara's odometer history
 * (SamsaraClient.listOdometerHistory was read in memory by the stop writer only).
 * Static: computeLoadRealDrivenMiles reports odometer_gaps (timed boundaries with no anchor); the miles cron runs the
 * backfill before the compute inside its lease; the backfill asks Samsara outside any DB transaction (plan → fetch →
 * write), stores only confidence 'measured' rows with source 'samsara' (never a NULL marker: the PM rate engine reads any
 * 'suggested' row as a 90-day odometer gap), never reaches beyond ±30 minutes, and the anchor rule is unchanged.
 * --selftest plants each defect in memory.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-odometer-history-backfill-wired";
const F = {
  svc: "apps/backend/src/telematics/odometer-history-backfill.service.ts",
  miles: "apps/backend/src/telematics/load-real-driven-miles.service.ts",
  cron: "apps/backend/src/telematics/load-real-driven-miles.cron.ts",
  anchor: "apps/backend/src/telematics/odometer-anchor.ts",
};

function fn(src, name) {
  const re = new RegExp(`export (async )?function ${name}\\(`);
  const m = re.exec(src);
  if (!m) return "";
  const j = src.indexOf("\nexport ", m.index + 10);
  return src.slice(m.index, j < 0 ? undefined : j);
}

export function findDefects(s) {
  const out = [];
  // Row 116 (11-03): the gaps also carry a fence crossing's own time (`${key}:fence`) while its boundary is unmeasured.
  if (!/odometer_gaps = \[\.\.\.keys, \.\.\.fenceGaps\]\.map\(\(k\) => timedByKey\.get\(k\)\)\.filter\(\(b\): b is BoundaryRequest => !!b && !anchors\.get\(b\.key\)\?\.anchor\)/.test(s.miles))
    out.push("computeLoadRealDrivenMiles does not report the timed boundaries without an anchor (odometer_gaps)");
  const tick = s.cron.slice(s.cron.indexOf("wrapBackgroundJobTick("));
  const iB = tick.indexOf("await runOdometerHistoryBackfillTick(");
  const iM = tick.indexOf("await runLoadRealDrivenMilesCronTick(");
  if (iB < 0 || iM < 0 || iB > iM) out.push("the miles cron does not run the odometer backfill before the compute");
  if (!/leaseSeconds: JOB_LEASE_SECONDS/.test(tick)) out.push("the miles cron tick runs without its job lease");
  if (!/listOdometerHistory\(/.test(s.cron)) out.push("the backfill does not read Samsara's odometer history");
  const run = fn(s.svc, "runOdometerHistoryBackfill");
  const iPlan = run.indexOf("planOdometerBackfill(");
  const iFetch = run.indexOf("fetchBoundaryReads(");
  const iWrite = run.indexOf("writeBoundaryReads(");
  if (iPlan < 0 || iFetch < 0 || iWrite < 0 || !(iPlan < iFetch && iFetch < iWrite)) out.push("the backfill is not plan → fetch → write");
  const fetchLine = run.slice(iFetch - 80, iFetch + 80);
  if (/withDb/.test(fetchLine)) out.push("Samsara is called inside a DB transaction");
  const write = fn(s.svc, "writeBoundaryReads");
  // Row 116 (11-03): boundary reads carry source 'samsara_boundary' — outside the one-'samsara'-row-per-day key (202616340100).
  if (!/'samsara_boundary', 'measured'/.test(write)) out.push("the backfill does not store Samsara reads as source 'samsara_boundary', confidence 'measured'");
  if (/suggested/.test(write)) out.push("the backfill writes 'suggested' rows (read as an odometer gap by the PM rate engine)");
  if (!/ON CONFLICT DO NOTHING/.test(write)) out.push("the backfill insert is not idempotent");
  if (!/export const BACKFILL_WINDOW_MIN = 30;/.test(s.svc)) out.push("the backfill window is not ±30 minutes (the anchor rule's moving tolerance)");
  const plan = fn(s.svc, "planOdometerBackfill");
  if (!/o\.source IN \('samsara', 'samsara_boundary'\)/.test(plan) || !/make_interval\(mins => \$4::int\)/.test(plan)) out.push("the plan asks again for boundaries already answered (the ±window)");
  if (/odometer_reading_day/.test(plan)) out.push("the plan skips a boundary because the daily snapshot holds that day's 'samsara' slot (row 116)");
  if (!/export const MOVING_ANCHOR_MAX_MINUTES = 30;/.test(s.anchor) || !/confidence IN \('measured','entered'\)/.test(s.anchor))
    out.push("the anchor rule changed (30-minute moving tolerance; measured/entered reads only)");
  return out;
}

const src = Object.fromEntries(Object.entries(F).map(([k, f]) => [k, readFileSync(path.join(ROOT, f), "utf8")]));
if (process.argv.includes("--selftest")) {
  const plant = (k, a, b) => ({ ...src, [k]: src[k].replace(a, b) });
  const plants = [
    ["compute stops reporting gaps", plant("miles", "!!b && !anchors.get(b.key)?.anchor", "!!b")],
    ["cron skips the backfill", plant("cron", "await runOdometerHistoryBackfillTick(app.log);", "")],
    ["backfill writes suggested markers", plant("svc", "'samsara_boundary', 'measured')", "'samsara_boundary', 'suggested')")],
    ["backfill writes into the per-day 'samsara' slot", plant("svc", "'samsara_boundary', 'measured')", "'samsara', 'measured')")],
    ["backfill window widened", plant("svc", "export const BACKFILL_WINDOW_MIN = 30;", "export const BACKFILL_WINDOW_MIN = 240;")],
    ["plan re-asks answered windows", plant("svc", "o.source IN ('samsara', 'samsara_boundary')", "o.source = 'manual'")],
    ["anchor tolerance loosened", plant("anchor", "export const MOVING_ANCHOR_MAX_MINUTES = 30;", "export const MOVING_ANCHOR_MAX_MINUTES = 600;")],
    ["fetch moved before plan", plant("svc", "  const fetched = await fetchBoundaryReads(planned.requests, planned.fetchHistory);", "")],
  ];
  let caught = 0;
  for (const [name, planted] of plants) {
    const changed = Object.keys(F).some((k) => planted[k] !== src[k]);
    const hit = changed && findDefects(planted).length > 0;
    console.log(`${hit ? "ok  " : "MISS"}  plant: ${name}`);
    if (hit) caught++;
  }
  console.log(`${LABEL} SELFTEST: ${caught}/${plants.length} planted defects caught`);
  process.exit(caught === plants.length ? 0 : 1);
}
const defects = findDefects(src);
if (defects.length) { console.error(`${LABEL} FAIL:\n - ${defects.join("\n - ")}`); process.exit(1); }
console.log(`${LABEL} PASS — unmeasured boundaries get Samsara's own odometer reads (measured only, ±30 min, outside any transaction)`);
