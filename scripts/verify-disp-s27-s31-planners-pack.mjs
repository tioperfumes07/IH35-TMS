#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["planning.driver","planning.truck","planning.loads","planning.timeline"],"task":"DISP-F5846-PLANNER-REVERSE-EXACT-LEAVES"} */
/** DISP-S27…S31 — planners redirect + leaf surfaces entity-scoped + honest empty. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-disp-s27-s31-planners-pack";
const SELFTEST = process.argv.includes("--selftest");
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const SELF = "scripts/verify-disp-s27-s31-planners-pack.mjs";
const MATRIX = "docs/specs/scoreboard/modules/dispatch.required.json";

const FILES = {
  driver: "apps/frontend/src/pages/dispatch/planners/DriverPlanner.tsx",
  grid: "apps/frontend/src/pages/dispatch/planners/SafetyDriverSchedulerGrid.tsx",
  loads: "apps/frontend/src/pages/dispatch/planners/LoadsPlanner.tsx",
  timeline: "apps/frontend/src/pages/dispatch/planners/UnifiedTimelinePlanner.tsx",
  truck: "apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertLive(overrides = {}) {
  const get = (rel) => overrides[rel] ?? read(rel);
  const problems = [];
  const self = get(SELF);
  if (!/^\/\*\* @matrix-built \{"modules":\["dispatch"\],"cols":\["reverse_link"\],"leaves":\["planning\.driver","planning\.truck","planning\.loads","planning\.timeline"\],"task":"DISP-F5846-PLANNER-REVERSE-EXACT-LEAVES"\} \*\/$/m.test(self)) {
    problems.push("planner Built annotation must own four exact reverse leaves");
  }
  let matrixLeaves = [];
  try {
    matrixLeaves = JSON.parse(get(MATRIX)).leaves ?? [];
  } catch {
    problems.push("dispatch Required matrix must parse");
  }
  for (const id of ["planning.driver", "planning.truck", "planning.loads", "planning.timeline"]) {
    if (!matrixLeaves.find((leaf) => leaf.id === id)?.required?.includes("reverse_link")) problems.push(`${id} must require reverse_link`);
  }
  const manifest = get(MANIFEST);
  if (!/path="\/dispatch\/planners"[\s\S]*?Navigate replace to="\/dispatch\/planners\/timeline"/.test(manifest)) {
    problems.push("S27: /dispatch/planners must Navigate to /dispatch/planners/timeline");
  }
  if (!/path="\/dispatch\/planners\/timeline"/.test(manifest) || !/UnifiedTimelinePlanner/.test(manifest)) {
    problems.push("S30: manifest missing timeline → UnifiedTimelinePlanner");
  }
  if (!/path="\/dispatch\/planners\/driver"/.test(manifest) || !/DriverPlanner/.test(manifest)) {
    problems.push("S28: manifest missing driver planner");
  }
  if (!/path="\/dispatch\/planners\/loads"/.test(manifest) || !/LoadsPlanner/.test(manifest)) {
    problems.push("S29: manifest missing loads planner");
  }
  if (!/path="\/dispatch\/planners\/truck"/.test(manifest) || !/TruckPlanner/.test(manifest)) {
    problems.push("S31: manifest missing truck planner");
  }

  const driver = get(FILES.driver);
  if (!/data-testid="dispatch-driver-planner-need-company"/.test(driver)) problems.push("S28 missing need-company");
  const grid = get(FILES.grid);
  if (!/ListErrorBanner/.test(grid)) problems.push("S28 grid missing ListErrorBanner");
  if (!/data-testid="dispatch-driver-planner-honest-empty"/.test(grid)) problems.push("S28 missing honest empty");
  if (!/enabled:\s*Boolean\(operatingCompanyId\)/.test(grid)) problems.push("S28 grid not company-gated");
  if (!/<EntityLinkOrTombstone kind="driver" id=\{driverId\} name=\{name\} noun="Driver"/.test(grid)) problems.push("S28 grid missing canonical driver links");
  if (!/<EntityLinkOrTombstone kind="unit" id=\{unitId\} name=\{unit\} noun="Unit"/.test(grid)) problems.push("S28 grid missing canonical unit links");

  const loads = get(FILES.loads);
  if (!/data-testid="dispatch-loads-planner-need-company"/.test(loads)) problems.push("S29 missing need-company");
  if (!/data-testid="dispatch-loads-planner-honest-empty"/.test(loads)) problems.push("S29 missing honest empty");
  if (!/ListErrorBanner/.test(loads)) problems.push("S29 missing ListErrorBanner");
  if (!/enabled:\s*Boolean\(operatingCompanyId\)/.test(loads)) problems.push("S29 not company-gated");
  if (!/<EntityLinkOrTombstone kind="customer" id=\{load\.customer_id\} name=\{load\.customer_name\} noun="Customer"/.test(loads)) problems.push("S29 load rows missing canonical customer link or tombstone");
  if (!/<EntityLink(?:OrTombstone)? kind="load" id=\{load\.id\}/.test(loads)) problems.push("S29 load rows missing canonical load link");

  const timeline = get(FILES.timeline);
  if (!/data-testid="dispatch-timeline-need-company"/.test(timeline)) problems.push("S30 missing need-company");
  if (!/data-testid="dispatch-timeline-honest-empty"/.test(timeline)) problems.push("S30 missing honest empty");
  if (!/ListErrorBanner/.test(timeline)) problems.push("S30 missing ListErrorBanner");
  if (!/enabled:\s*Boolean\(operatingCompanyId\)/.test(timeline)) problems.push("S30 not company-gated");
  if (!/<EntityLinkOrTombstone kind="customer" id=\{load\.customer_id\} name=\{load\.customer_name\} noun="Customer"/.test(timeline)) problems.push("S30 timeline rows missing canonical customer link or tombstone");
  if (!/<EntityLink kind="driver" id=\{driver\.id\}/.test(timeline)) problems.push("S30 driver rows missing canonical driver link");
  if (!/<EntityLinkOrTombstone kind="unit" id=\{driver\.unit_id\} name=\{driver\.unit_number\} noun="Unit"/.test(timeline)) problems.push("S30 driver rows missing canonical unit link or tombstone");
  if (!/PlannerAxisHead/.test(timeline)) problems.push("S30 timeline missing two-row PlannerAxisHead");
  if (!/timeline-util-/.test(timeline)) problems.push("S30 timeline missing util column");
  if (!/h-\[34px\]/.test(timeline)) problems.push("S30 timeline missing 34px row height");

  const truck = get(FILES.truck);
  if (!/data-testid="dispatch-truck-planner-need-company"/.test(truck)) problems.push("S31 missing need-company");
  if (!/data-testid="dispatch-truck-planner-honest-empty"/.test(truck)) problems.push("S31 missing honest empty");
  if (!/ListErrorBanner/.test(truck)) problems.push("S31 missing ListErrorBanner");
  if (!/enabled:\s*Boolean\(operatingCompanyId\)/.test(truck)) problems.push("S31 not company-gated");
  if (!/driverId:\s*dr\.driver_id \? String\(dr\.driver_id\) : null/.test(truck)) problems.push("S31 drops driver FK while shaping truck rows");
  if (!/<EntityLinkOrTombstone kind="unit" id=\{row\.unitId\} name=\{row\.unitNumber\} noun="Unit"/.test(truck)) problems.push("S31 missing canonical unit links");
  if (!/<EntityLinkOrTombstone kind="driver" id=\{row\.driverId\} name=\{row\.driverName\} noun="Driver"/.test(truck)) problems.push("S31 missing canonical driver links");
  if (!/PlannerAxisHead/.test(truck)) problems.push("S31 truck missing two-row PlannerAxisHead");
  if (!/PlannerAxisHead/.test(loads)) problems.push("S29 loads missing two-row PlannerAxisHead");
  if (!/PlannerAxisHead/.test(grid)) problems.push("S28 grid missing two-row PlannerAxisHead");

  return problems;
}

if (SELFTEST) {
  const live = assertLive();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  const cases = [
    [FILES.timeline, "timeline-util-"],
    [FILES.grid, '<EntityLinkOrTombstone kind="driver" id={driverId} name={name} noun="Driver"'],
    [FILES.grid, '<EntityLinkOrTombstone kind="unit" id={unitId} name={unit} noun="Unit"'],
    [FILES.truck, '<EntityLinkOrTombstone kind="unit" id={row.unitId} name={row.unitNumber} noun="Unit"'],
    [FILES.truck, '<EntityLinkOrTombstone kind="driver" id={row.driverId} name={row.driverName} noun="Driver"'],
  ];
  for (const [relativePath, needle] of cases) {
    const orig = read(relativePath);
    const planted = orig.replace(needle, "__PLANTED_PLANNER_DEFECT__");
    if (planted === orig) {
      console.error(`${LABEL} SELFTEST FAILED: inert mutation ${relativePath}`);
      process.exit(1);
    }
    if (!assertLive({ [relativePath]: planted }).length) {
      console.error(`${LABEL} SELFTEST FAILED: planted defect not caught in ${relativePath}`);
      process.exit(1);
    }
  }
  let evidenceCaught = 0;
  const selfMutant = read(SELF).replace(/^\/\*\* @matrix-built .*$/m, "/** planted broad Built claim */");
  if (assertLive({ [SELF]: selfMutant }).includes("planner Built annotation must own four exact reverse leaves")) evidenceCaught += 1;
  for (const id of ["planning.driver", "planning.truck", "planning.loads", "planning.timeline"]) {
    const matrix = JSON.parse(read(MATRIX));
    const leaf = matrix.leaves.find((candidate) => candidate.id === id);
    leaf.required = leaf.required.filter((column) => column !== "reverse_link");
    if (assertLive({ [MATRIX]: JSON.stringify(matrix) }).includes(`${id} must require reverse_link`)) evidenceCaught += 1;
  }
  const total = cases.length + 5;
  if (evidenceCaught !== 5) {
    console.error(`${LABEL} SELFTEST FAILED: evidence plants ${evidenceCaught}/5`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${total}/${total} mutations caught`);
  process.exit(0);
}

const problems = assertLive();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
