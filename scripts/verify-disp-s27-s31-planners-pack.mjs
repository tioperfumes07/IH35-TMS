#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["driver","unit","load","connectivity","reverse_link"],"leafRe":"^planning\\.(calendar|loads|timeline)$","task":"CLS-DISPATCH-PLANNER-DRIVER-UNIT-LINKS"} */
/** @matrix-built {"modules":["dispatch"],"cols":["driver","unit","connectivity","reverse_link"],"leafRe":"^planning\\.(driver|truck)$","task":"CLS-DISPATCH-DRIVER-TRUCK-PLANNER-LINKS"} */
/** DISP-S27…S31 — planners redirect + leaf surfaces entity-scoped + honest empty. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-disp-s27-s31-planners-pack";
const SELFTEST = process.argv.includes("--selftest");
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

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

function assertLive() {
  const problems = [];
  const manifest = read(MANIFEST);
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

  const driver = read(FILES.driver);
  if (!/data-testid="dispatch-driver-planner-need-company"/.test(driver)) problems.push("S28 missing need-company");
  const grid = read(FILES.grid);
  if (!/ListErrorBanner/.test(grid)) problems.push("S28 grid missing ListErrorBanner");
  if (!/data-testid="dispatch-driver-planner-honest-empty"/.test(grid)) problems.push("S28 missing honest empty");
  if (!/enabled:\s*Boolean\(operatingCompanyId\)/.test(grid)) problems.push("S28 grid not company-gated");
  if (!/<EntityLink kind="driver" id=\{driverId\}/.test(grid)) problems.push("S28 grid missing canonical driver links");
  if (!/<EntityLink kind="unit" id=\{unitId\}/.test(grid)) problems.push("S28 grid missing canonical unit links");

  const loads = read(FILES.loads);
  if (!/data-testid="dispatch-loads-planner-need-company"/.test(loads)) problems.push("S29 missing need-company");
  if (!/data-testid="dispatch-loads-planner-honest-empty"/.test(loads)) problems.push("S29 missing honest empty");
  if (!/ListErrorBanner/.test(loads)) problems.push("S29 missing ListErrorBanner");
  if (!/enabled:\s*Boolean\(operatingCompanyId\)/.test(loads)) problems.push("S29 not company-gated");
  if (!/<EntityLinkOrTombstone kind="customer" id=\{load\.customer_id\} name=\{load\.customer_name\} noun="Customer"/.test(loads)) problems.push("S29 load rows missing canonical customer link or tombstone");
  if (!/<EntityLink(?:OrTombstone)? kind="load" id=\{load\.id\}/.test(loads)) problems.push("S29 load rows missing canonical load link");

  const timeline = read(FILES.timeline);
  if (!/data-testid="dispatch-timeline-need-company"/.test(timeline)) problems.push("S30 missing need-company");
  if (!/data-testid="dispatch-timeline-honest-empty"/.test(timeline)) problems.push("S30 missing honest empty");
  if (!/ListErrorBanner/.test(timeline)) problems.push("S30 missing ListErrorBanner");
  if (!/enabled:\s*Boolean\(operatingCompanyId\)/.test(timeline)) problems.push("S30 not company-gated");
  if (!/<EntityLinkOrTombstone kind="customer" id=\{load\.customer_id\} name=\{load\.customer_name\} noun="Customer"/.test(timeline)) problems.push("S30 timeline rows missing canonical customer link or tombstone");
  if (!/<EntityLink kind="driver" id=\{driver\.id\}/.test(timeline)) problems.push("S30 driver rows missing canonical driver link");
  if (!/<EntityLinkOrTombstone kind="unit" id=\{driver\.unit_id\} name=\{driver\.unit_number\} noun="Unit"/.test(timeline)) problems.push("S30 driver rows missing canonical unit link or tombstone");

  const truck = read(FILES.truck);
  if (!/data-testid="dispatch-truck-planner-need-company"/.test(truck)) problems.push("S31 missing need-company");
  if (!/data-testid="dispatch-truck-planner-honest-empty"/.test(truck)) problems.push("S31 missing honest empty");
  if (!/ListErrorBanner/.test(truck)) problems.push("S31 missing ListErrorBanner");
  if (!/enabled:\s*Boolean\(operatingCompanyId\)/.test(truck)) problems.push("S31 not company-gated");
  if (!/driverId:\s*dr\.driver_id \? String\(dr\.driver_id\) : null/.test(truck)) problems.push("S31 drops driver FK while shaping truck rows");
  if (!/<EntityLink kind="unit" id=\{row\.unitId\}/.test(truck)) problems.push("S31 missing canonical unit links");
  if (!/<EntityLink kind="driver" id=\{row\.driverId\}/.test(truck)) problems.push("S31 missing canonical driver links");

  return problems;
}

if (SELFTEST) {
  const live = assertLive();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  const pagePath = path.join(ROOT, FILES.timeline);
  const orig = fs.readFileSync(pagePath, "utf8");
  fs.writeFileSync(pagePath, orig.replace(/data-testid="dispatch-timeline-honest-empty"/, 'data-testid="x"'));
  try {
    if (!assertLive().length) {
      console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
      process.exit(1);
    }
  } finally {
    fs.writeFileSync(pagePath, orig);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertLive();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
