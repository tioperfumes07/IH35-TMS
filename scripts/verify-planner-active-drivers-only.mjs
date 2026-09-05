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

// 2. getPlannerWeek — dispatch/planner.service.ts
const plannerService = read("apps/backend/src/dispatch/planner.service.ts");
const plannerWeekMatch = plannerService.match(/export async function getPlannerWeek[\s\S]*?\n  \}\)/);
if (!plannerWeekMatch) {
  failures.push("planner.service.ts: getPlannerWeek function not found");
} else {
  const fn = plannerWeekMatch[0];
  if (!fn.includes("d.deactivated_at IS NULL")) {
    failures.push("getPlannerWeek: must filter d.deactivated_at IS NULL (active drivers only)");
  }
  if (!fn.includes("d.status = 'Active'::mdata.driver_status")) {
    failures.push("getPlannerWeek: must filter d.status = 'Active'::mdata.driver_status (active drivers only)");
  }
}

if (failures.length) {
  console.error("FAIL verify-planner-active-drivers-only:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("PASS verify-planner-active-drivers-only — all planner grids filter active drivers (BRD-21)");
