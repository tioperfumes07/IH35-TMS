#!/usr/bin/env node
/**
 * verify-planner-outside-range-widens.mjs
 *
 * B-3 (owner dispatch 2026-09-10): the PlannerGrid "N loads outside this range ->"
 * button must widen or shift the rendered date range (the `days` array), NOT merely set
 * scrollLeft. Before this fix the button's onClick was:
 *
 *   const el = scrollRef.current; if (el) el.scrollLeft = el.scrollWidth;
 *
 * — which only scrolled horizontally inside the existing range. Loads whose start/end fell
 * outside `days[0]..days[days.length-1]` were never revealed.
 *
 * This guard asserts:
 *  1. PlannerGrid Props include onExpandRange callback
 *  2. The button onClick calls onExpandRange — not just scrollLeft
 *  3. The outside useMemo computes minOutside / maxOutside YMD dates
 *  4. widenPlannerRange exists in planner-range.ts
 *  5. Every parent that renders <PlannerGrid> passes onExpandRange wired to setRange
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-planner-outside-range-widens";

const GRID_FILE = "apps/frontend/src/pages/dispatch/planners/PlannerGrid.tsx";
const RANGE_FILE = "apps/frontend/src/pages/dispatch/planners/planner-range.ts";
const TIMELINE_FILE = "apps/frontend/src/pages/dispatch/planners/UnifiedTimelinePlanner.tsx";
const TRUCK_FILE = "apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx";
const LOADS_FILE = "apps/frontend/src/pages/dispatch/planners/LoadsPlanner.tsx";
const DRIVER_FILE = "apps/frontend/src/pages/dispatch/planners/DriverPlanner.tsx";
const SAFETY_FILE = "apps/frontend/src/pages/dispatch/planners/SafetyDriverSchedulerGrid.tsx";

function load(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function check({
  grid = load(GRID_FILE),
  range = load(RANGE_FILE),
  timeline = load(TIMELINE_FILE),
  truck = load(TRUCK_FILE),
  loads = load(LOADS_FILE),
  driver = load(DRIVER_FILE),
  safety = load(SAFETY_FILE),
} = {}) {
  const f = [];

  if (!/onExpandRange\?\:/.test(grid)) {
    f.push(`${GRID_FILE}: Props missing onExpandRange callback`);
  }
  if (!/onExpandRange\(outside\.minOutside,\s*outside\.maxOutside\)/.test(grid)) {
    f.push(`${GRID_FILE}: outside-range button must call onExpandRange(outside.minOutside, outside.maxOutside)`);
  }
  if (!/minOutside/.test(grid) || !/maxOutside/.test(grid)) {
    f.push(`${GRID_FILE}: outside useMemo must compute minOutside and maxOutside YMD dates`);
  }
  if (!/export function widenPlannerRange/.test(range)) {
    f.push(`${RANGE_FILE}: missing export function widenPlannerRange`);
  }
  if (!/onExpandRange.*setRange.*widenPlannerRange/.test(timeline)) {
    f.push(`${TIMELINE_FILE}: must pass onExpandRange wired to setRange + widenPlannerRange`);
  }
  if (!/onExpandRange.*setRange.*widenPlannerRange/.test(truck)) {
    f.push(`${TRUCK_FILE}: must pass onExpandRange wired to setRange + widenPlannerRange`);
  }
  if (!/onExpandRange.*setRange.*widenPlannerRange/.test(loads)) {
    f.push(`${LOADS_FILE}: must pass onExpandRange wired to setRange + widenPlannerRange`);
  }
  if (!/onExpandRange.*setRange/.test(driver)) {
    f.push(`${DRIVER_FILE}: must pass onExpandRange={setRange} to SafetyDriverSchedulerGrid`);
  }
  if (!/onExpandRange.*widenPlannerRange/.test(safety)) {
    f.push(`${SAFETY_FILE}: must pass onExpandRange wired to widenPlannerRange`);
  }

  return f;
}

function selftest() {
  const goodGrid = `
    onExpandRange?: (minOutsideYmd: string, maxOutsideYmd: string) => void;
    const outside = useMemo(() => {
      let minOutside = "";
      let maxOutside = "";
      return { count: n, minOutside, maxOutside };
    }, [rows, rangeStart, rangeEnd]);
    onClick={() => {
      if (onExpandRange && outside.minOutside && outside.maxOutside) {
        onExpandRange(outside.minOutside, outside.maxOutside);
      }
    }}
  `;
  const goodRange = `export function widenPlannerRange(range, minYmd, maxYmd) { return {}; }`;
  const goodParent = `onExpandRange={(minYmd, maxYmd) => setRange(widenPlannerRange(range, minYmd, maxYmd))}`;
  const goodDriver = `onExpandRange={setRange}`;
  const goodSafety = `onExpandRange={onExpandRange ? (minYmd, maxYmd) => onExpandRange(widenPlannerRange(range, minYmd, maxYmd)) : undefined}`;

  const failures = check({
    grid: goodGrid, range: goodRange, timeline: goodParent, truck: goodParent,
    loads: goodParent, driver: goodDriver, safety: goodSafety,
  });
  if (failures.length > 0) {
    console.error(`SELFTEST ${LABEL}: expected 0 failures, got ${failures.length}`);
    for (const fail of failures) console.error(`  ${fail}`);
    process.exit(1);
  }

  const badGrid = goodGrid.replace(/onExpandRange\(outside\.minOutside,\s*outside\.maxOutside\)/, 'el.scrollLeft = el.scrollWidth');
  const badFailures = check({
    grid: badGrid, range: goodRange, timeline: goodParent, truck: goodParent,
    loads: goodParent, driver: goodDriver, safety: goodSafety,
  });
  if (badFailures.length === 0) {
    console.error(`SELFTEST ${LABEL}: expected failures for scrollLeft-only onClick, got 0`);
    process.exit(1);
  }

  console.log(`SELFTEST ${LABEL}: OK`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const failures = check();
  if (failures.length > 0) {
    console.error(`FAIL ${LABEL}:`);
    for (const fail of failures) console.error(`  ${fail}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}`);
}

main();
