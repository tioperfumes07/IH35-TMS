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
 *   7. the load screen stops naming each mileage basis;
 *   8. the three-mile CPM report (reports/three-mile-cpm.service.ts) computes its own cost instead of the
 *      canonical per-load cost rollup, divides one basis's miles into the cost of loads without that basis,
 *      loses a basis label, counts voided or non-diesel gallons in MPG, or is unwired from the route/screen;
 *   9. any backend file blends two mileage bases into one number -- COALESCE(miles_practical, miles_shortest)
 *      (measured 2026-10-01: 8 sites in 5 engines did, so "miles" was billed for some loads and paid for others);
 *      exempt: IFTA state apportionment (not a cost-per-mile figure) and the settlement driver-pay rate,
 *      which names its basis on every row (miles_basis_type);
 *  10. the truck-level CPM reports (Per-truck CPM dashboard, Maintenance cost per unit) stop taking real driven
 *      miles from the one odometer engine, or the Per-truck dashboard counts voided driver bills as pay.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const LABEL = "verify-load-real-driven-miles";
const ENGINE = "apps/backend/src/telematics/load-real-driven-miles.service.ts";
const MIGRATION = "db/migrations/202615160000_load_real_driven_miles.sql";
const INDEX = "apps/backend/src/index.ts";
const SCREEN = "apps/frontend/src/components/dispatch/LoadRealDrivenMilesSection.tsx";
const DRAWER = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";
const REPORT = "apps/backend/src/reports/three-mile-cpm.service.ts";
const REPORT_PANEL = "apps/frontend/src/components/reports/ThreeMileCpmPanel.tsx";
const REPORT_PAGE = "apps/frontend/src/pages/reports/ProfitPerTruckPage.tsx";
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

export function checkReport(src, index, panel, page) {
  const p = [];
  const code = strip(src);
  if (!/\$\{loadCostRollupLateral\("l\.id", "l\.operating_company_id"\)\}/.test(code)) p.push(`${REPORT}: direct cost no longer comes from the canonical loadCostRollupLateral.`);
  if (/FROM accounting\.(expenses|bill_lines|bills)\b|FROM driver_finance\.driver_bills/.test(code)) p.push(`${REPORT}: the report sums cost tables itself -- second cost engine.`);
  const bf = code.match(/export function basisFigure\([\s\S]*?\n\}/);
  if (!bf || !/const with_ = loads\.filter\(\(l\) => l\.miles\[basis\] != null/.test(bf[0]) || !/with_\.reduce\(\(s, l\) => s \+ l\.direct_cost_cents, 0\)/.test(bf[0])) p.push(`${REPORT}: a basis no longer divides only the cost of loads that have that basis.`);
  if (!bf || !/basis_label: MILEAGE_BASES\[basis\]/.test(bf[0])) p.push(`${REPORT}: a CPM figure lost its basis label.`);
  if (!/ft\.voided_at IS NULL AND ft\.fuel_type = 'diesel'/.test(code)) p.push(`${REPORT}: MPG gallons no longer exclude voided and non-diesel fuel.`);
  if (!/computeLoadRealDrivenMiles\(client, operatingCompanyId,/.test(code)) p.push(`${REPORT}: real driven miles no longer come from the load real-driven-miles engine.`);
  if (!/registerThreeMileCpmRoutes\(app\)/.test(index)) p.push(`${INDEX}: the three-mile CPM route is not registered.`);
  for (const label of ["Real driven", "Practical (billed)", "Short (paid)"]) if (!panel.includes(label)) p.push(`${REPORT_PANEL}: the "${label}" basis label is gone.`);
  if (!/<ThreeMileCpmPanel /.test(page)) p.push(`${REPORT_PAGE}: the three-mile panel is not mounted.`);
  return p;
}

const BLEND = /COALESCE\(\s*(?:SUM\()?\s*(?:\w+\.)?miles_practical\s*,\s*(?:\w+\.)?miles_shortest/;
const BLEND_EXEMPT = new Map([
  ["apps/backend/src/ifta/ifta-state-miles-aggregator.ts", "IFTA state apportionment, not a cost-per-mile figure"],
  ["apps/backend/src/driver-finance/settlements.service.ts", "driver-pay effective rate; every row names its basis in miles_basis_type (CC-3 lane)"],
]);
function backendFiles(dir = "apps/backend/src", out = []) {
  for (const name of readdirSync(resolve(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (name === "__tests__" || name === "node_modules") continue;
    if (statSync(resolve(ROOT, rel)).isDirectory()) backendFiles(rel, out);
    else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) out.push(rel);
  }
  return out;
}
export function checkNoBlendedBasis(files) {
  const p = [];
  for (const [rel, src] of files) if (!BLEND_EXEMPT.has(rel) && BLEND.test(strip(src))) p.push(`${rel}: blends practical and shortest miles into one basis -- name ONE basis per figure.`);
  return p;
}
const PPT = "apps/backend/src/reports/profit-per-truck.routes.ts";
const MCPU = "apps/backend/src/reports/maintenance-cost-per-unit.routes.ts";
export function checkTruckReports(ppt, mcpu) {
  const p = [];
  for (const [rel, src] of [[PPT, ppt], [MCPU, mcpu]]) if (!/computePmCostPerMile\(client,/.test(strip(src))) p.push(`${rel}: real driven miles no longer come from the one odometer engine (computePmCostPerMile).`);
  if (!/db\.status <> 'void'/.test(ppt)) p.push(`${PPT}: driver pay counts voided driver bills.`);
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
  const rp = [read(REPORT), read(INDEX), read(REPORT_PANEL), read(REPORT_PAGE)];
  expect("real report", checkReport(...rp), false);
  expect("report sums bills itself", checkReport(rp[0] + "\nconst x = `SELECT 1 FROM accounting.bill_lines`;", rp[1], rp[2], rp[3]), true);
  expect("report mixes bases", checkReport(rp[0].replace("const with_ = loads.filter((l) => l.miles[basis] != null", "const with_ = loads.filter((l) => true || l.miles[basis] != null").replace("with_.reduce((s, l) => s + l.direct_cost_cents, 0)", "loads.reduce((s, l) => s + l.direct_cost_cents, 0)"), rp[1], rp[2], rp[3]), true);
  expect("MPG counts voided fuel", checkReport(rp[0].replace("ft.voided_at IS NULL AND ft.fuel_type = 'diesel'", "ft.fuel_type = 'diesel'"), rp[1], rp[2], rp[3]), true);
  const all = backendFiles().map((f) => [f, read(f)]);
  expect("real backend has no blended basis", checkNoBlendedBasis(all), false);
  expect("a new blend is caught", checkNoBlendedBasis([["apps/backend/src/x.ts", "SELECT COALESCE(l.miles_practical, l.miles_shortest, 0)"]]), true);
  expect("IFTA exemption honoured", checkNoBlendedBasis([["apps/backend/src/ifta/ifta-state-miles-aggregator.ts", "COALESCE(SUM(COALESCE(l.miles_practical, l.miles_shortest, 0)), 0)"]]), false);
  expect("real truck reports", checkTruckReports(read(PPT), read(MCPU)), false);
  expect("voided driver bills counted", checkTruckReports(read(PPT).replace("db.status <> 'void'", "true"), read(MCPU)), true);
  console.log(ok ? `${LABEL} --selftest PASS (16/16)` : `${LABEL} --selftest FAIL`);
  process.exit(ok ? 0 : 1);
}
const problems = [
  ...checkEngine(read(ENGINE)),
  ...checkWiring(read(MIGRATION), read(INDEX), read(SCREEN), read(DRAWER)),
  ...checkReport(read(REPORT), read(INDEX), read(REPORT_PANEL), read(REPORT_PAGE)),
  ...checkNoBlendedBasis(backendFiles().map((f) => [f, read(f)])),
  ...checkTruckReports(read(PPT), read(MCPU)),
];
if (problems.length) { console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL}: OK -- load/leg real driven miles from geofence or device-recorded odometer only; NULL with reason, never 0 or partial; one anchor rule; stored, cron and screen wired; three-mile CPM report on the canonical cost rollup, every basis named; no blended mileage basis; truck CPM reports on the odometer engine.`);
