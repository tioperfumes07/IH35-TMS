#!/usr/bin/env node
// ROUND 326 queue item 17 / audit M3 (CC-1) — ONE FLEET ROSTER. "The fleet is 16 trucks, not 43 rows; 7 belong to
// TRANSPORTATION." Fleet counts and CPM baselines each rolled their own predicate (owner OR lessee, no vehicle type).
// Fails if:
//   1. fleetRosterSql stops scoping by the OPERATING entity (COALESCE(leased-to, owner)), stops requiring a power-unit
//      vehicle_type, or stops excluding deactivated / sample / demo / sold / disposed units;
//   2. a maintenance fleet counter or CPM baseline stops reading the roster: pm-cost-per-mile unit list, kpi
//      countActiveUnits, dashboard-kpis fleet tile, fleet-table/kpis (which also reports unclassified units).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-one-fleet-roster";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  helper: "apps/backend/src/mdata/fleet-visibility.ts",
  cpm: "apps/backend/src/maintenance/pm-cost-per-mile.service.ts",
  kpi: "apps/backend/src/maintenance/kpi.routes.ts",
  dashKpis: "apps/backend/src/maintenance/dashboard-kpis.routes.ts",
  dash: "apps/backend/src/maintenance/dashboard.routes.ts",
};

export function problems(src) {
  const p = [];
  const h = src.helper.slice(src.helper.indexOf("export function fleetRosterSql"));
  if (!/COALESCE\(\$\{c\("currently_leased_to_company_id"\)\}, \$\{c\("owner_company_id"\)\}\)/.test(h)) p.push("fleetRosterSql must scope by the operating entity (COALESCE(leased-to, owner))");
  if (!/vehicle_type IN \(/.test(h) || !/FLEET_ROSTER_TRUCK_TYPES = \["Tractor", "Straight Truck", "Box Truck"\]/.test(src.helper)) p.push("fleetRosterSql must require a power-unit vehicle_type");
  for (const need of ['c("deactivated_at")} IS NULL', "excludeSampleDataSql(", "excludeDemoPhantomSql(", 'c("sold_date")} IS NULL', 'c("disposed_date")} IS NULL']) if (!h.includes(need)) p.push(`fleetRosterSql must keep: ${need}`);
  if (!/fleetRosterSql\("u", "\$1"\)/.test(src.cpm)) p.push("pm-cost-per-mile's unit list must be the fleet roster");
  if (!/async function countActiveUnits[\s\S]{0,400}fleetRosterSql\(/.test(src.kpi)) p.push("kpi countActiveUnits must count the fleet roster");
  if (!/AS total_units[\s\S]{0,500}fleetRosterSql\(/.test(src.dashKpis)) p.push("the dashboard fleet tile must count the fleet roster");
  if (!/AS unclassified_units[\s\S]{0,300}fleetRosterSql\(""/.test(src.dash)) p.push("fleet-table/kpis must count the roster and report unclassified units");
  return p;
}

export function run() {
  return problems(Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")])));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")]));
  const own = problems(src);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["owner scope", { ...src, helper: src.helper.replace('COALESCE(${c("currently_leased_to_company_id")}, ${c("owner_company_id")})', '${c("owner_company_id")}') }],
      ["no type", { ...src, helper: src.helper.replace("vehicle_type IN (", "vehicle_type NOT IN (") }],
      ["cpm own predicate", { ...src, cpm: src.cpm.replace('fleetRosterSql("u", "$1")', "u.owner_company_id = $1::uuid") }],
      ["tile own predicate", { ...src, dashKpis: src.dashKpis.replace('WHERE ${fleetRosterSql("", "$1")}', "WHERE owner_company_id = $1::uuid") }],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL — ${own.join("; ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — maintenance fleet counts and CPM baselines read one roster (operating entity, power units, active).`);
}
