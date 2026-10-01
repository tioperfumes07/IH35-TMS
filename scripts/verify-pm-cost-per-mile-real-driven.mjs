#!/usr/bin/env node
/**
 * verify-step 12041 -- E-15 PM COST PER MILE (Owner Law 2026-10-01; ORDER-2026-09-04 three-mile CPM).
 *
 * FAILS IF:
 *   1. real driven miles read anything but the odometer (telematics.vehicle_locations.odometer_mi / the
 *      odometer_readings ledger) -- e.g. miles_practical / miles_shortest -- or are interpolated;
 *   2. a missing real mileage can become 0 instead of NULL with a reason (realDrivenMiles / cpmFor);
 *   3. a CPM is emitted without its mileage basis label;
 *   4. cpmFor can return null when miles > 0 (a unit with miles and cost must have a CPM);
 *   5. a second CPM engine exists: the Maintenance KPI tile, the KPI drilldown and the "Cost per mile" report must
 *      read computePmCostPerMile, never divide by practical/short miles themselves.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const LABEL = "verify-pm-cost-per-mile-real-driven";
const ENGINE = "apps/backend/src/maintenance/pm-cost-per-mile.service.ts";
const KPI = "apps/backend/src/maintenance/kpi.routes.ts";
const REPORTS = "apps/backend/src/maintenance/reports.routes.ts";
// The odometer-at-a-moment rule is shared with the load/leg real-driven-miles engine (ORDER-2026-09-04).
const ANCHOR = "apps/backend/src/telematics/odometer-anchor.ts";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

export function checkEngine(src, anchorSrc = read(ANCHOR)) {
  const p = [];
  const code = strip(src);
  const anchor = strip(anchorSrc);
  if (!/fetchOdometerAnchors\(client, operatingCompanyId,/.test(code)) p.push(`${ENGINE}: period boundaries no longer resolve through the shared fetchOdometerAnchors.`);
  const odoSql = anchor.match(/export async function fetchOdometerAnchors\([\s\S]*?\n\}/);
  if (!odoSql) p.push(`${ANCHOR}: the odometer anchor query is gone.`);
  else {
    if (!/telematics\.vehicle_locations/.test(odoSql[0])) p.push(`${ANCHOR}: real miles no longer read telematics.vehicle_locations.odometer_mi.`);
    if (/miles_practical|miles_shortest|miles_deadhead/.test(odoSql[0])) p.push(`${ANCHOR}: real driven miles read practical/short miles.`);
  }
  for (const [f, c] of [[ENGINE, code], [ANCHOR, anchor]]) if (/\binterpolat|\blerp\b/i.test(c)) p.push(`${f}: interpolation code found -- odometer is READ or ABSENT.`);
  const real = anchor.match(/export function realDrivenMiles\([\s\S]*?\n\}/);
  if (!real || !/miles: null, reason:/.test(real[0])) p.push(`${ANCHOR}: realDrivenMiles no longer returns NULL with a reason for a missing anchor.`);
  if (real && /miles: 0\b/.test(real[0])) p.push(`${ANCHOR}: realDrivenMiles can return 0 for a missing mileage.`);
  const cpm = code.match(/export function cpmFor\([\s\S]*?\n\}/);
  if (!cpm) p.push(`${ENGINE}: cpmFor is gone.`);
  else {
    if (!/basis_label: MILEAGE_BASES\[basis\]/.test(cpm[0])) p.push(`${ENGINE}: cpmFor no longer labels its mileage basis.`);
    if (!/cents_per_mile: Math\.round\(\(costCents \/ miles\)/.test(cpm[0])) p.push(`${ENGINE}: cpmFor no longer returns a CPM when miles > 0.`);
  }
  for (const b of ["real_driven", "practical", "short"]) if (!new RegExp(`${b}:`).test(code)) p.push(`${ENGINE}: mileage basis "${b}" missing from MILEAGE_BASES.`);
  return p;
}

export function checkNoSecondEngine(kpiSrc, reportsSrc) {
  const p = [];
  const k = strip(kpiSrc), r = strip(reportsSrc);
  if (!/computePmCostPerMile\(/.test(k)) p.push(`${KPI}: the CPM tile/drilldown no longer read computePmCostPerMile.`);
  if (/COALESCE\(l\.miles_practical/.test(k)) p.push(`${KPI}: a CPM divides by practical miles again -- second CPM engine.`);
  const caseBlock = r.match(/case "cost_per_mile":[\s\S]*?case "cost_by_source_type":/);
  if (!caseBlock || !/computePmCostPerMile\(/.test(caseBlock[0])) p.push(`${REPORTS}: the "Cost per mile" report no longer reads computePmCostPerMile.`);
  return p;
}

const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

if (process.argv.includes("--selftest")) {
  let ok = true;
  const expect = (name, problems, wantFail) => {
    if ((problems.length > 0) !== wantFail) { console.error(`SELFTEST FAIL: ${name}: ${JSON.stringify(problems)}`); ok = false; }
  };
  expect("real engine", checkEngine(read(ENGINE)), false);
  expect("real no-second-engine", checkNoSecondEngine(read(KPI), read(REPORTS)), false);
  expect("real miles from practical", checkEngine(read(ENGINE), read(ANCHOR).replace("AND odometer_mi IS NOT NULL AND captured_at <= q.ts", "AND miles_practical > 0 AND captured_at <= q.ts")), true);
  expect("missing miles become 0", checkEngine(read(ENGINE), read(ANCHOR).replace("if (!start) return { miles: null, reason:", "if (!start) return { miles: 0, reason:")), true);
  expect("E-15 stops using the shared anchors", checkEngine(read(ENGINE).replace(/fetchOdometerAnchors\(client/g, "localAnchors(client")), true);
  expect("CPM loses its basis", checkEngine(read(ENGINE).replace("basis_label: MILEAGE_BASES[basis]", "basis_label: ''")), true);
  expect("KPI back on practical miles", checkNoSecondEngine(read(KPI).replace(/computePmCostPerMile\(/g, "x(") + "\nCOALESCE(l.miles_practical, 0)", read(REPORTS)), true);
  console.log(ok ? `${LABEL} --selftest PASS (7/7)` : `${LABEL} --selftest FAIL`);
  process.exit(ok ? 0 : 1);
}
const problems = [...checkEngine(read(ENGINE)), ...checkNoSecondEngine(read(KPI), read(REPORTS))];
if (problems.length) { console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL}: OK -- one CPM engine; real driven miles from the odometer only; NULL with reason, never 0; every CPM names its basis.`);
