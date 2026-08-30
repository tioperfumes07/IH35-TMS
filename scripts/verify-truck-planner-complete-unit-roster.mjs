#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch","fleet"],"cols":["unit","driver","connectivity","reverse_link","qbo_chrome"],"leaves":["planner.trucks"],"task":"FLT-F6923-TRUCK-PLANNER-COMPLETE-UNIT-ROSTER","vertical":"class-sweep"} */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./verify-nonmoney-vendor-complete-rosters.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const live = {
  api: read("apps/frontend/src/api/mdata.ts"),
  page: read("apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx"),
  backend: read("apps/backend/src/mdata/units.routes.ts"),
  scheduler: read("apps/backend/src/safety/driver-scheduler.service.ts"),
  planner: read("apps/backend/src/dispatch/planner.service.ts"),
};

function verify(s) {
  const unitApi = s.api.slice(
    s.api.indexOf("export async function listAllUnits"),
    s.api.indexOf("export type QboVendorCandidate"),
  );
  const checks = [
    ["shared exhaustive unit scanner", unitApi.startsWith("export async function listAllUnits")],
    ["authoritative stable total", /expectedTotal = total/.test(unitApi) && /total !== expectedTotal/.test(unitApi)],
    ["deduplicated IDs", /const seen = new Set<string>\(\)/.test(unitApi) && /seen\.add\(id\)/.test(unitApi)],
    ["progress-safe offset", /offset \+= page\.units\.length/.test(unitApi) && /page\.units\.length === 0/.test(unitApi)],
    ["deterministic SQL range", /ORDER BY created_at DESC, id DESC/.test(s.backend)],
    ["planner exhausts scoped roster", /const unitsQuery = useQuery\([\s\S]*?listAllUnits\(\{ operating_company_id: operatingCompanyId \}\)/.test(s.page)],
    ["planner has no bounded unit-master call", !/const unitsQuery = useQuery\([\s\S]*?listUnits\(\{/.test(s.page)],
    ["unit read failure remains visible", /const isError = gridQuery\.isError \|\| unitsQuery\.isError \|\| reservedQuery\.isError/.test(s.page) && /unitsQuery\.refetch\(\)/.test(s.page)],
    ["OOS truth still mapped into grid", /Boolean\(unit\.is_oos\)/.test(s.page) && /status:\s*"in-shop"/.test(s.page)],
    ["retired units excluded from planner master", /PLANNER_UNIT_STATUSES\.has\(String\(unit\.status \?\? ""\)\)/.test(s.page)],
    ["scheduler rows require active drivers", /AND d\.status = 'Active'::mdata\.driver_status/.test(s.scheduler)],
    ["scheduler vacant units require InService", /AND u\.assigned_driver_id IS NULL[\s\S]{0,100}AND u\.status = 'InService'::mdata\.unit_status/.test(s.scheduler)],
    ["timeline rows require active drivers", /AND d\.archived_at IS NULL[\s\S]{0,100}AND d\.status = 'Active'::mdata\.driver_status/.test(s.planner)],
    ["timeline unit join excludes retired units", /LEFT JOIN mdata\.units u[\s\S]{0,300}u\.deactivated_at IS NULL[\s\S]{0,150}u\.status IN \('InService', 'OutOfService', 'InMaintenance'\)/.test(s.planner)],
  ];
  return checks.filter(([, ok]) => !ok).map(([label]) => label);
}

const failures = verify(live);
if (failures.length) {
  console.error(`verify-truck-planner-complete-unit-roster FAILED: ${failures.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["total drift accepted", { ...live, api: live.api.replace("if (total !== expectedTotal)", "if (false)") }],
    ["early empty accepted", { ...live, api: live.api.replace("if (page.units.length === 0)", "if (false)") }],
    ["unstable SQL", { ...live, backend: live.backend.replace(", id DESC", "") }],
    ["planner first page", { ...live, page: live.page.replace("listAllUnits({", "listUnits({") }],
    ["unit error hidden", { ...live, page: live.page.replace("unitsQuery.isError", "false") }],
    ["OOS signal lost", { ...live, page: live.page.replace("Boolean(unit.is_oos)", "false") }],
    ["retired unit admitted", { ...live, page: live.page.replace("if (!PLANNER_UNIT_STATUSES.has(String(unit.status ?? \"\"))) continue;", "") }],
    ["inactive scheduler driver admitted", { ...live, scheduler: live.scheduler.replace("AND d.status = 'Active'::mdata.driver_status", "AND TRUE") }],
    ["inactive vacant unit admitted", { ...live, scheduler: live.scheduler.replace("AND u.status = 'InService'::mdata.unit_status", "AND TRUE") }],
    ["inactive timeline driver admitted", { ...live, planner: live.planner.replace("AND d.status = 'Active'::mdata.driver_status", "AND TRUE") }],
    ["retired timeline unit admitted", { ...live, planner: live.planner.replace("AND u.deactivated_at IS NULL", "AND TRUE") }],
  ];
  for (const [label, mutation] of mutations) {
    if (verify(mutation).length === 0) {
      console.error(`verify-truck-planner-complete-unit-roster SELFTEST FAILED: mutation survived: ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-truck-planner-complete-unit-roster SELFTEST PASS — ${mutations.length} planted defects rejected`);
}

console.log("verify-truck-planner-complete-unit-roster PASS — Truck Planner schedules the complete scoped unit master with OOS/error truth");
