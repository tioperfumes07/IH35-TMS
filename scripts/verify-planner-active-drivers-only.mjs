#!/usr/bin/env node
/**
 * BRD-21 guard (owner 2026-09-05): planner grids show ACTIVE drivers only.
 * Asserts that every backend query feeding a planner grid filters:
 *   - d.deactivated_at IS NULL
 *   - d.status = 'Active'::mdata.driver_status
 * The two planner data sources are:
 *   1. getFleetSchedule  (SafetyDriverSchedulerGrid, TruckPlanner)
 *   2. getPlannerWeek    (UnifiedTimelinePlanner, LoadsPlanner)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

const failures = [];

// 1. getFleetSchedule — safety/driver-scheduler.service.ts
const schedulerService = read("apps/backend/src/safety/driver-scheduler.service.ts");
const fleetScheduleMatch = schedulerService.match(/export async function getFleetSchedule[\s\S]*?\n\}/);
if (!fleetScheduleMatch) {
  failures.push("driver-scheduler.service.ts: getFleetSchedule function not found");
} else {
  const fn = fleetScheduleMatch[0];
  if (!fn.includes("d.deactivated_at IS NULL")) {
    failures.push("getFleetSchedule: must filter d.deactivated_at IS NULL (active drivers only)");
  }
  if (!fn.includes("d.status = 'Active'::mdata.driver_status")) {
    failures.push("getFleetSchedule: must filter d.status = 'Active'::mdata.driver_status (active drivers only)");
  }
}

// 2. getPlannerWeek — dispatch/planner.service.ts. LEAD 443.266-A: getPlannerWeek is now a thin scope wrapper; the roster
// SQL lives in loadPlannerWeekOnClient (the guard read the wrapper and went red on a refactor). Read the query function.
const plannerService = read("apps/backend/src/dispatch/planner.service.ts");
export function plannerWeekFailures(src) {
  const out = [];
  const wrapper = src.match(/export async function getPlannerWeek[\s\S]*?\n  \}\)/);
  if (!wrapper) out.push("planner.service.ts: getPlannerWeek function not found");
  const start = src.indexOf("async function loadPlannerWeekOnClient(");
  const fn = start >= 0 ? src.slice(start, src.indexOf("\n}\n", start)) : "";
  if (!fn) {
    out.push("planner.service.ts: loadPlannerWeekOnClient (the planner roster query) not found");
    return out;
  }
  if (wrapper && !/loadPlannerWeekOnClient\(/.test(wrapper[0])) out.push("getPlannerWeek: does not read through loadPlannerWeekOnClient");
  if (!fn.includes("d.deactivated_at IS NULL")) out.push("getPlannerWeek: must filter d.deactivated_at IS NULL (active drivers only)");
  if (!fn.includes("d.status = 'Active'::mdata.driver_status")) out.push("getPlannerWeek: must filter d.status = 'Active'::mdata.driver_status (active drivers only)");
  return out;
}
failures.push(...plannerWeekFailures(plannerService));

if (process.argv.includes("--selftest")) {
  const plants = [
    ["deactivated driver admitted", plannerService.replace("AND d.deactivated_at IS NULL\n          AND d.archived_at IS NULL", "AND d.archived_at IS NULL")],
    ["inactive idle driver admitted", plannerService.replace("OR (d.status = 'Active'::mdata.driver_status", "OR (TRUE")],
    ["roster query function renamed away", plannerService.replace("async function loadPlannerWeekOnClient(", "async function loadSomethingElse(")],
  ];
  let bad = 0;
  for (const [label, mutated] of plants) {
    const caught = mutated !== plannerService && plannerWeekFailures(mutated).length > 0;
    console.log(`  ${caught ? "✓" : "✗"} ${label} FAILS`);
    if (!caught) bad += 1;
  }
  if (bad) {
    console.error("verify-planner-active-drivers-only --selftest FAIL");
    process.exit(1);
  }
  console.log(`verify-planner-active-drivers-only --selftest PASS (${plants.length}/${plants.length})`);
}

if (failures.length) {
  console.error("FAIL verify-planner-active-drivers-only:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("PASS verify-planner-active-drivers-only — all planner grids filter active drivers (BRD-21)");
