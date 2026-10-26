#!/usr/bin/env node
/**
 * GUARD: GPS-dwell stop boundary — when the truck never entered the stop's fence, its own dwell at the stop is the
 * measurement, AUTOMATICALLY, inside the hourly real-driven-miles cron (owner 2026-10-11 "the gps is source of truth";
 * 2026-10-25 9:37 PM CT "the system is supposed to do it automatically not you").
 *
 * Asserts (static, against the real sources):
 *   1. DWELL — the engine picks a dwell within DWELL_BOUNDARY_RADIUS_M (<= 4828 m, 3 mi), at least DWELL_BOUNDARY_MIN_MINUTES,
 *      inside DWELL_BOUNDARY_WINDOW_HOURS, excluding fuel stops / the yard (loadDwellExclusionZones).
 *   2. FAR — a dwell beyond the radius is refused with a reason (never used).
 *   3. NONE — no dwell / no fixes -> hit null with a reason (the load stays NULL + reason, never 0).
 *   4. USED — computeLoadRealDrivenMiles requests dwells only for boundaries with no fence capture and no device time,
 *      resolves their odometer through the SHARED fetchOdometerAnchors, and passes the pick to resolveStopBoundary, whose
 *      dwell branch is guarded by !deviceTime and carries the evidence in via (dwellVia).
 *   5. WIRED — runLoadRealDrivenMilesCronTick computes through computeLoadRealDrivenMiles and the cron registers it.
 *   6. ONE exclusion definition — stop-gps-verification uses loadDwellExclusionZones (no second copy of the fuel/yard SQL).
 *   7. END TO END — the cron tick writes the dwell evidence (persistStopDwellEvidence: stop event, link only when NULL,
 *      GPS-verified fence through the single minter bindVerifiedStopFence, replay through replayUnitWindowForFences), runs
 *      captureGeofenceOdometerEvents and recomputes; the compute matches the stop's own -gps fence; the evidence writer never
 *      stamps a stop time / source / precision.
 *
 *   node scripts/verify-stop-dwell-boundary.mjs [--selftest]
 */
import { readFileSync, existsSync } from "node:fs";

const LABEL = "verify-stop-dwell-boundary";
const DWELL = "apps/backend/src/telematics/stop-dwell-boundary.service.ts";
const MILES = "apps/backend/src/telematics/load-real-driven-miles.service.ts";
const VERIFY = "apps/backend/src/telematics/stop-gps-verification.service.ts";
const CRON = "apps/backend/src/telematics/load-real-driven-miles.cron.ts";
const EVIDENCE = "apps/backend/src/telematics/stop-dwell-evidence.service.ts";
const BINDER = "apps/backend/src/dispatch/geofences/load-geofence-binding.service.ts";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

export function check(src) {
  const p = [];
  const dwell = strip(src.dwell);
  const miles = strip(src.miles);
  const verify = strip(src.verify);
  const cron = strip(src.cron);
  const evidence = strip(src.evidence);
  const binder = strip(src.binder);

  const radius = dwell.match(/export const DWELL_BOUNDARY_RADIUS_M = (\d+)/);
  if (!radius || Number(radius[1]) > 4828) p.push(`${DWELL}: DWELL_BOUNDARY_RADIUS_M missing or above 4828 m (3 mi).`);
  const minM = dwell.match(/export const DWELL_BOUNDARY_MIN_MINUTES = (\d+)/);
  if (!minM || Number(minM[1]) < 10) p.push(`${DWELL}: DWELL_BOUNDARY_MIN_MINUTES missing or under 10 minutes.`);
  if (!/export const DWELL_BOUNDARY_WINDOW_HOURS = \d+/.test(dwell)) p.push(`${DWELL}: DWELL_BOUNDARY_WINDOW_HOURS missing.`);

  const pick = dwell.match(/export function pickStopDwell\([\s\S]*?\n\}/);
  if (!pick) p.push(`${DWELL}: pickStopDwell is gone.`);
  else {
    const b = pick[0];
    if (!/d\.dwellMinutes >= DWELL_BOUNDARY_MIN_MINUTES/.test(b)) p.push(`${DWELL}: short pauses are no longer excluded.`);
    if (!/!zones\.some\(/.test(b)) p.push(`${DWELL}: fuel-stop / yard dwells are no longer excluded.`);
    if (!/best\.m > DWELL_BOUNDARY_RADIUS_M\)\s*\{\s*return \{ hit: null, reason:/.test(b)) p.push(`${DWELL}: a dwell beyond the radius is not refused with a reason (FAR).`);
    if (!/if \(!hasFixes\) return \{ hit: null, reason:/.test(b)) p.push(`${DWELL}: no fixes does not return null with a reason (NONE).`);
    if (!/usable\.length === 0\)\s*\{\s*return \{ hit: null, reason:/.test(b)) p.push(`${DWELL}: no qualifying dwell does not return null with a reason (NONE).`);
    if (!/at: side === "arrival" \? started : ended/.test(b)) p.push(`${DWELL}: arrival/departure no longer map to dwell start/end.`);
  }
  if (!/detectStops\(unitId, fixes\)/.test(dwell)) p.push(`${DWELL}: dwells no longer come from the shared detectStops detector.`);
  if (!/export async function loadDwellExclusionZones/.test(dwell) || !/location_kind = 'fuel_stop' OR location_kind = 'yard'/.test(dwell)) {
    p.push(`${DWELL}: loadDwellExclusionZones (fuel stops / yard) is gone.`);
  }

  if (!/await fetchStopDwells\(client, operatingCompanyId, dwellReqs\)/.test(miles)) p.push(`${MILES}: computeLoadRealDrivenMiles no longer requests GPS dwells.`);
  if (!/if \(pick\.hit\) timed\.push\(\{ key, unit_id: unit, at: pick\.hit\.at \}\)/.test(miles)) p.push(`${MILES}: a dwell's odometer no longer goes through the shared fetchOdometerAnchors.`);
  if (!/fetchOdometerAnchors\(client, operatingCompanyId, timed\)/.test(miles)) p.push(`${MILES}: fetchOdometerAnchors is no longer the odometer source.`);
  if (!/resolveStopBoundary\(w\.side, w\.stop, hits\.get\(w\.key\), anchors\.get\(w\.key\), dwells\.get\(w\.key\)\)/.test(miles)) p.push(`${MILES}: the dwell pick is not passed to resolveStopBoundary.`);
  const resolver = miles.match(/export function resolveStopBoundary\([\s\S]*?\n\}/);
  if (!resolver) p.push(`${MILES}: resolveStopBoundary is gone.`);
  else {
    if (!/if \(!deviceTime && dwell\?\.hit\)/.test(resolver[0])) p.push(`${MILES}: the dwell branch is not guarded by the device-time precedence.`);
    const branch = resolver[0].match(/if \(!deviceTime && dwell\?\.hit\) \{[\s\S]*?\n  \}/)?.[0] ?? resolver[0].match(/if \(dwell\?\.hit\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
    if (!/via: dwellVia\(dwell\.hit\)/.test(branch)) p.push(`${MILES}: the dwell evidence no longer travels on the leg source.`);
    if (!/anchor: timeAnchor\?\.anchor \?\? null,/.test(branch)) p.push(`${MILES}: the dwell odometer is not the shared anchor.`);
  }
  if (!/runLoadRealDrivenMilesCronTick[\s\S]*computeLoadRealDrivenMiles\(db, company\.id,/.test(miles)) p.push(`${MILES}: the cron tick no longer computes through computeLoadRealDrivenMiles (WIRED).`);
  if (!/runLoadRealDrivenMilesCronTick/.test(cron)) p.push(`${CRON}: the cron no longer runs runLoadRealDrivenMilesCronTick (WIRED).`);

  const tick = miles.match(/export async function runLoadRealDrivenMilesCronTick[\s\S]*?\n\}/)?.[0] ?? "";
  if (!/await persistStopDwellEvidence\(db, company\.id, evidence\)/.test(tick)) p.push(`${MILES}: the cron tick no longer writes the GPS-dwell evidence (END TO END).`);
  if (!/await captureGeofenceOdometerEvents\(db as never, \{ operatingCompanyId: company\.id \}\)/.test(tick)) p.push(`${MILES}: the tick no longer reads the odometer for the replayed crossings.`);
  if (!/persistLoadRealDrivenMiles\(db, company\.id, await computeLoadRealDrivenMiles\(db, company\.id, again\)\)/.test(tick)) p.push(`${MILES}: the tick no longer recomputes the GPS-verified loads.`);
  if (!/g\.label = q\.gps_label/.test(miles) || !/loadStopGpsFenceLabel\(w\.stop\.load_id, w\.stop\.sequence_number\)/.test(miles)) p.push(`${MILES}: the compute no longer matches the stop's own GPS-verified fence.`);
  if (!/'load_stop_gps_dwell'/.test(src.evidence)) p.push(`${EVIDENCE}: the dwell is no longer written as a stop event.`);
  if (!/s\.actual_stop_event_id IS NULL/.test(evidence)) p.push(`${EVIDENCE}: the stop link can overwrite existing evidence.`);
  if (/actual_(arrival|departure)_at\s*=|actual_stamp_precision\s*=|actual_(arrival|departure)_source\s*=/.test(evidence)) p.push(`${EVIDENCE}: the evidence writer stamps a stop time / source / precision (detention reads them).`);
  if (!/await bindVerifiedStopFence\(/.test(evidence)) p.push(`${EVIDENCE}: the GPS-verified fence is not minted through the single minter.`);
  if (/INSERT INTO geo\.geofences/.test(evidence)) p.push(`${EVIDENCE}: a second fence minter.`);
  if (!/await replayUnitWindowForFences\(/.test(evidence)) p.push(`${EVIDENCE}: the dwell window is not replayed through the canonical detector.`);
  if (!/export async function bindVerifiedStopFence/.test(binder) || !/loadStopGpsFenceLabel\(loadId, sequence\)/.test(binder)) p.push(`${BINDER}: bindVerifiedStopFence (the -gps fence) is gone from the single minter.`);
  if (!/await loadDwellExclusionZones\(client, input\.operatingCompanyId\)/.test(verify)) p.push(`${VERIFY}: stop GPS verification no longer uses the shared loadDwellExclusionZones.`);
  if (/location_kind = 'fuel_stop'/.test(verify)) p.push(`${VERIFY}: a second copy of the fuel-stop / yard exclusion SQL.`);
  return p;
}

function read() {
  for (const f of [DWELL, MILES, VERIFY, CRON, EVIDENCE, BINDER]) if (!existsSync(f)) return { missing: f };
  return { dwell: readFileSync(DWELL, "utf8"), miles: readFileSync(MILES, "utf8"), verify: readFileSync(VERIFY, "utf8"), cron: readFileSync(CRON, "utf8"),
    evidence: readFileSync(EVIDENCE, "utf8"), binder: readFileSync(BINDER, "utf8") };
}

function selftest() {
  const real = read();
  if (real.missing) { console.error(`${LABEL} --selftest FAIL — ${real.missing} missing`); process.exit(1); }
  const base = check(real);
  if (base.length) { console.error(`${LABEL} --selftest FAIL — real sources do not pass:\n  - ${base.join("\n  - ")}`); process.exit(1); }
  const plants = [
    ["radius widened past 3 mi", "dwell", (s) => s.replace(/export const DWELL_BOUNDARY_RADIUS_M = \d+/, "export const DWELL_BOUNDARY_RADIUS_M = 20000")],
    ["far dwell used (refusal removed)", "dwell", (s) => s.replace(/if \(best\.m > DWELL_BOUNDARY_RADIUS_M\) \{/, "if (false) {")],
    ["no dwell returns a figure", "dwell", (s) => s.replace(/if \(usable\.length === 0\) \{\s*return \{ hit: null, reason:/, "if (usable.length === 0) { return { hit: usable[0], reason:")],
    ["short pause accepted", "dwell", (s) => s.replace("d.dwellMinutes >= DWELL_BOUNDARY_MIN_MINUTES", "d.dwellMinutes >= 0")],
    ["fuel stops not excluded", "dwell", (s) => s.replace("!zones.some(", "!([]).some(")],
    ["engine stops requesting dwells", "miles", (s) => s.replace("await fetchStopDwells(client, operatingCompanyId, dwellReqs)", "new Map()")],
    ["dwell beats device time", "miles", (s) => s.replace("if (!deviceTime && dwell?.hit)", "if (dwell?.hit)")],
    ["dwell odometer invented", "miles", (s) => s.replace("anchor: timeAnchor?.anchor ?? null,", "anchor: { odometer_mi: 0, read_at: dwell.hit.at, source: \"vehicle_locations\" },")],
    ["cron unwired", "cron", (s) => s.split("runLoadRealDrivenMilesCronTick").join("noop")],
    ["second exclusion copy", "verify", (s) => s + "\nconst x = `location_kind = 'fuel_stop'`;"],
    ["tick stops writing evidence", "miles", (s) => s.replace("await persistStopDwellEvidence(db, company.id, evidence)", "await Promise.resolve(evidence)")],
    ["tick skips odometer capture", "miles", (s) => s.replace("await captureGeofenceOdometerEvents(db as never, { operatingCompanyId: company.id })", "await Promise.resolve()")],
    ["gps fence not matched", "miles", (s) => s.replace("g.label = q.gps_label", "false")],
    ["evidence overwrites a link", "evidence", (s) => s.replace("s.actual_stop_event_id IS NULL", "true")],
    ["evidence stamps a time", "evidence", (s) => s.replace("SET actual_stop_event_id = $2::uuid", "SET actual_stop_event_id = $2::uuid, actual_departure_at = now()")],
    ["second fence minter", "evidence", (s) => s + "\nconst m = `INSERT INTO geo.geofences (label) VALUES ('x')`;"],
    ["no replay", "evidence", (s) => s.replace("await replayUnitWindowForFences(", "await Promise.resolve(")],
    ["binder loses -gps fence", "binder", (s) => s.replace("export async function bindVerifiedStopFence", "async function bindVerifiedStopFenceGone")],
  ];
  let caught = 0;
  for (const [name, key, mut] of plants) {
    const copy = { ...real, [key]: mut(real[key]) };
    if (copy[key] === real[key]) { console.error(`${LABEL} --selftest FAIL — plant "${name}" changed nothing (re-anchor)`); process.exit(1); }
    if (check(copy).length === 0) { console.error(`${LABEL} --selftest FAIL — plant "${name}" was NOT caught`); process.exit(1); }
    caught++;
  }
  console.log(`${LABEL} --selftest PASS — ${caught}/${plants.length} plants caught (in memory; no tracked file touched).`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();
const src = read();
if (src.missing) { console.error(`${LABEL} FAIL — ${src.missing} missing`); process.exit(1); }
const problems = check(src);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — GPS dwell (<= 3 mi, >= 10 min, fuel/yard excluded) is the stop boundary when no fence/device time exists; far dwell refused; no dwell -> NULL + reason; odometer via the shared anchor; the hourly cron writes stop evidence, the -gps fence, replayed crossings, odometer captures and recomputed driven miles.`);
