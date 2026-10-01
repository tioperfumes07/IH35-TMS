#!/usr/bin/env node
/**
 * verify-step 12045 -- ORDER-2026-09-04 three-mile CPM: REAL DRIVEN miles per load and leg.
 *
 * FAILS IF:
 *   1. the load/leg engine reads practical or short miles (miles_practical / miles_shortest / miles_deadhead) to
 *      produce real driven miles, or interpolates;
 *   2. a geofence capture whose odometer is not real_obd (interpolated / absent) is used as a boundary;
 *   3. a manual or unsourced stop time is used as a measurement (only MEASURED_STOP_TIME_SOURCES may be);
 *   4. a missing leg can become 0, or the load total can be a partial sum of its legs;
 *   5. the engine stops using the shared odometer-anchor rule (telematics/odometer-anchor.ts) -- one definition;
 *   6. migration 202615160000 loses its "NULL needs a reason, never negative" CHECK, or the cron/route is unwired;
 *   7. the load screen stops naming each mileage basis.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const LABEL = "verify-load-real-driven-miles";
const ENGINE = "apps/backend/src/telematics/load-real-driven-miles.service.ts";
const MIGRATION = "db/migrations/202615160000_load_real_driven_miles.sql";
const INDEX = "apps/backend/src/index.ts";
const SCREEN = "apps/frontend/src/components/dispatch/LoadRealDrivenMilesSection.tsx";
const DRAWER = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

export function checkEngine(src) {
  const p = [];
  const code = strip(src);
  const compute = code.match(/export async function computeLoadRealDrivenMiles\([\s\S]*?\n\}/);
  if (!compute) return [`${ENGINE}: computeLoadRealDrivenMiles is gone.`];
  const stopCols = code.match(/const STOP_COLS = `[\s\S]*?`;/);
  if (!stopCols) p.push(`${ENGINE}: STOP_COLS is gone.`);
  if (/miles_practical|miles_shortest|miles_deadhead/.test(compute[0] + (stopCols?.[0] ?? ""))) p.push(`${ENGINE}: real driven miles read practical/short miles.`);
  if (/\blerp\b|interpolate\(/i.test(code)) p.push(`${ENGINE}: interpolation code found -- odometer is READ or ABSENT.`);
  if (!/fetchOdometerAnchors\(client, operatingCompanyId, timed\)/.test(compute[0])) p.push(`${ENGINE}: device-time boundaries no longer use the shared fetchOdometerAnchors.`);
  const resolver = code.match(/export function resolveStopBoundary\([\s\S]*?\n\}/);
  if (!resolver) p.push(`${ENGINE}: resolveStopBoundary is gone.`);
  else {
    if (!/hit\.odo != null && hit\.src === "real_obd"/.test(resolver[0])) p.push(`${ENGINE}: a geofence capture is used without requiring a real_obd odometer.`);
    if (!/MEASURED_STOP_TIME_SOURCES[\s\S]{0,40}\.includes\(src\)/.test(resolver[0])) p.push(`${ENGINE}: stop times are used without checking they were device-recorded.`);
  }
  const sources = code.match(/export const MEASURED_STOP_TIME_SOURCES = \[([^\]]*)\]/);
  if (!sources || /"manual"/.test(sources[1])) p.push(`${ENGINE}: MEASURED_STOP_TIME_SOURCES missing or includes manual entries.`);
  const total = code.match(/export function loadTotalFromLegs\([\s\S]*?\n\}/);
  if (!total) p.push(`${ENGINE}: loadTotalFromLegs is gone.`);
  else {
    if (!/legs\.find\(\(l\) => l\.miles == null\)/.test(total[0])) p.push(`${ENGINE}: the load total no longer refuses when a loaded leg is missing (partial sum).`);
    if (/miles: 0\b/.test(total[0])) p.push(`${ENGINE}: the load total can be 0 for missing miles.`);
  }
  return p;
}

export function checkWiring(migration, index, screen, drawer) {
  const p = [];
  if (!/loads_miles_driven_actual_null_has_reason/.test(migration) || !/miles_driven_actual IS NULL AND miles_driven_actual_reason IS NOT NULL/.test(migration)) p.push(`${MIGRATION}: the NULL-needs-a-reason CHECK is gone.`);
  if (!/miles_driven_actual >= 0/.test(migration)) p.push(`${MIGRATION}: negative real miles are no longer refused.`);
  if (!/registerLoadRealDrivenMilesRoutes\(app\)/.test(index)) p.push(`${INDEX}: the load real-driven-miles route is not registered.`);
  if (!/initializeLoadRealDrivenMilesCron\(app\)/.test(index)) p.push(`${INDEX}: the load real-driven-miles cron is not started.`);
  for (const label of ["Practical (billed)", "Short (paid)", "Real driven (loaded)"]) if (!screen.includes(label)) p.push(`${SCREEN}: the "${label}" basis label is gone.`);
  if (!/<LoadRealDrivenMilesSection /.test(drawer)) p.push(`${DRAWER}: the load drawer no longer shows real driven miles.`);
  return p;
}

if (process.argv.includes("--selftest")) {
  let ok = true;
  const expect = (name, problems, wantFail) => {
    if ((problems.length > 0) !== wantFail) { console.error(`SELFTEST FAIL: ${name}: ${JSON.stringify(problems)}`); ok = false; }
  };
  const e = read(ENGINE), w = [read(MIGRATION), read(INDEX), read(SCREEN), read(DRAWER)];
  expect("real engine", checkEngine(e), false);
  expect("real wiring", checkWiring(...w), false);
  expect("interpolated geofence odometer accepted", checkEngine(e.replace('hit.odo != null && hit.src === "real_obd"', "hit.odo != null")), true);
  expect("manual stop time accepted", checkEngine(e.replace('["eld_geofence", "samsara_route", "driver_app"]', '["eld_geofence", "samsara_route", "driver_app", "manual"]')), true);
  expect("partial sum", checkEngine(e.replace("legs.find((l) => l.miles == null)", "undefined")), true);
  expect("practical miles in the engine", checkEngine(e.replace("s.actual_arrival_source AS arrival_source", "s.actual_arrival_source AS arrival_source, l.miles_practical")), true);
  expect("cron unwired", checkWiring(w[0], w[1].replace("initializeLoadRealDrivenMilesCron(app)", "x(app)"), w[2], w[3]), true);
  console.log(ok ? `${LABEL} --selftest PASS (7/7)` : `${LABEL} --selftest FAIL`);
  process.exit(ok ? 0 : 1);
}
const problems = [...checkEngine(read(ENGINE)), ...checkWiring(read(MIGRATION), read(INDEX), read(SCREEN), read(DRAWER))];
if (problems.length) { console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL}: OK -- load/leg real driven miles from geofence or device-recorded odometer only; NULL with reason, never 0 or partial; one anchor rule; stored, cron and screen wired.`);
