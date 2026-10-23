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
    // ed6239a3e0 (#21936, ROUND 20.6 K3) added the excluded-unit COUNTER, which repeats the same has() expression without
    // excluding anything — the rule must be the grid's own `continue`, or removing the filter goes unnoticed.
    ["retired units excluded from planner master", /if \(!PLANNER_UNIT_STATUSES\.has\(String\(unit\.status \?\? ""\)\)\) continue;/.test(s.page)],
    ["scheduler rows require active drivers", /AND d\.status = 'Active'::mdata\.driver_status/.test(s.scheduler)],
    // LEAD 443.266-A: these two rules were literal SQL from 2026-08-29 (DSP-F7376). LEAD 23:45Z parity (#27117) moved both
    // onto the ONE load service; the rules now assert that current required behaviour.
    // Vacant = THE shared in-service gate (InService + not OOS + no open WO; same set as Truck Line AVAILABLE) and no
    // board-set load on the truck.
    ["scheduler vacant units require the shared in-service gate", /WHERE \$\{UNIT_IN_SERVICE_SQL\}\s*AND NOT EXISTS \(SELECT 1 FROM mdata\.loads bl WHERE bl\.assigned_unit_id = u\.id AND \$\{canonicalDispatchWorkWhereClause\("bl", "\$1::uuid"\)\}\)/.test(s.scheduler) && /import \{ UNIT_IN_SERVICE_SQL \} from "\.\.\/dispatch\/unit-in-service\.js"/.test(s.scheduler)],
    // Timeline roster = not archived AND (running a board-set load — any status, Probation drivers run loads — OR an
    // Active driver with recent dispatch activity). Never an inactive idle driver.
    ["timeline rows require active drivers (or a driver running a board-set load)", /AND d\.archived_at IS NULL[\s\S]{0,1200}EXISTS \(\s*SELECT 1 FROM mdata\.loads cl\s*WHERE \$\{canonicalDispatchWorkWhereClause\("cl", "\$1::uuid"\)\}[\s\S]{0,600}OR \(d\.status = 'Active'::mdata\.driver_status\s*AND activity\.last_dispatch_activity_at >=/.test(s.planner)],
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
    ["in-shop / OOS truck admitted as vacant", { ...live, scheduler: live.scheduler.replace("WHERE ${UNIT_IN_SERVICE_SQL}", "WHERE u.deactivated_at IS NULL") }],
    ["truck on a board-set load admitted as vacant", { ...live, scheduler: live.scheduler.replace("AND NOT EXISTS (SELECT 1 FROM mdata.loads bl WHERE bl.assigned_unit_id = u.id", "AND EXISTS (SELECT 1 FROM mdata.loads bl WHERE bl.assigned_unit_id = u.id") }],
    ["inactive idle timeline driver admitted", { ...live, planner: live.planner.replace("OR (d.status = 'Active'::mdata.driver_status", "OR (TRUE") }],
    ["archived timeline driver admitted", { ...live, planner: live.planner.replace("AND d.archived_at IS NULL", "AND TRUE") }],
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
