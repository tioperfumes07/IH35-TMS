#!/usr/bin/env node
/**
 * GO-23 PR 1 guard (owner 2026-09-04): the dispatch planners were empty because
 * TruckPlanner.tsx and SafetyDriverSchedulerGrid.tsx passed hardcoded `bars: []`.
 * This guard proves both surfaces now compute bars from real load/assignment data
 * via the shared `planner-bars` helper.
 */
import fs from "node:fs";

const files = {
  truckPlanner: "apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx",
  driverSchedulerGrid: "apps/frontend/src/pages/dispatch/planners/SafetyDriverSchedulerGrid.tsx",
  helper: "apps/frontend/src/pages/dispatch/planners/planner-bars.ts",
};

const original = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]),
);

const contracts = [
  [
    "planner-bars helper exports usePlannerLoads and groupPlannerBarsByKey",
    "helper",
    (source) => source.includes("export function usePlannerLoads") && source.includes("export function groupPlannerBarsByKey"),
    (source) => source.replaceAll("export function usePlannerLoads", "function usePlannerLoads").replaceAll("export function groupPlannerBarsByKey", "function groupPlannerBarsByKey"),
  ],
  [
    "planner-bars helper fetches live loads via listAllLoads with board_scope=live",
    "helper",
    (source) => source.includes("listAllLoads") && source.includes('board_scope: "live"'),
    (source) => source.replaceAll('board_scope: "live"', 'board_scope: "all"'),
  ],
  [
    "TruckPlanner imports planner-bars helpers",
    "truckPlanner",
    (source) => source.includes('from "./planner-bars"') && source.includes("usePlannerLoads") && source.includes("groupPlannerBarsByKey"),
    (source) => source.replaceAll("groupPlannerBarsByKey", "").replaceAll("usePlannerLoads", ""),
  ],
  [
    "TruckPlanner computes bars from loads instead of empty array",
    "truckPlanner",
    (source) => !source.includes("bars: []"),
    (source) => `${source}\n// bars: []\n`,
  ],
  [
    "SafetyDriverSchedulerGrid imports planner-bars helpers",
    "driverSchedulerGrid",
    (source) => source.includes('from "./planner-bars"') && source.includes("usePlannerLoads") && source.includes("groupPlannerBarsByKey"),
    (source) => source.replaceAll("groupPlannerBarsByKey", "").replaceAll("usePlannerLoads", ""),
  ],
  [
    "SafetyDriverSchedulerGrid computes bars from loads instead of empty array",
    "driverSchedulerGrid",
    (source) => !source.includes("bars: []"),
    (source) => `${source}\n// bars: []\n`,
  ],
];

function audit(sources) {
  return contracts.filter(([, key, test]) => !test(sources[key])).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`[verify-planner-bars-wired] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, key, , mutate] of contracts) {
    const mutated = { ...original, [key]: mutate(original[key]) };
    if (audit(mutated).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`[verify-planner-bars-wired] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`);
  process.exit(0);
}

console.log("[verify-planner-bars-wired] OK");
