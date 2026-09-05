#!/usr/bin/env node
/**
 * BRD-19/K.4 guard: planner rows must expose status and action in their own
 * frozen columns, with name/unit already split off the calendar track.
 */
import fs from "node:fs";

const files = {
  grid: "apps/frontend/src/pages/dispatch/planners/PlannerGrid.tsx",
  truck: "apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx",
  driver: "apps/frontend/src/pages/dispatch/planners/SafetyDriverSchedulerGrid.tsx",
  loads: "apps/frontend/src/pages/dispatch/planners/LoadsPlanner.tsx",
  css: "apps/frontend/src/pages/dispatch/planners/PlannerGrid.css",
};

const original = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]),
);

const contracts = [
  [
    "PlannerGrid row type supports status and action fields",
    "grid",
    (s) => s.includes("status?: ReactNode") && s.includes("action?: ReactNode"),
    (s) => s.replace("status?: ReactNode", ""),
  ],
  [
    "PlannerGrid renders a frozen status column",
    "grid",
    (s) => s.includes("pg-col-status") && s.includes("planner-row-status") && s.includes("statusLabel"),
    (s) =>
      s
        .replace(/statusLabel/g, "sttusLabel")
        .replace(/pg-col-status/g, "pg-col-status-missing")
        .replace(/planner-row-status/g, "planner-row-status-missing"),
  ],
  [
    "PlannerGrid renders a frozen action column",
    "grid",
    (s) => s.includes("pg-col-action") && s.includes("planner-row-action") && s.includes("actionLabel"),
    (s) =>
      s
        .replace(/actionLabel/g, "actonLabel")
        .replace(/pg-col-action/g, "pg-col-action-missing")
        .replace(/planner-row-action/g, "planner-row-action-missing"),
  ],
  [
    "TruckPlanner supplies status and action per row",
    "truck",
    (s) => /status:\s*"In Use"|status:\s*"Available"|status:\s*"Reserved"|status:\s*"In Shop"/.test(s) && s.includes("PlannerAction"),
    (s) => s.replace(/status:\s*"[^"]+"/g, 'status: undefined'),
  ],
  [
    "Driver scheduler grid supplies status and action per row",
    "driver",
    (s) => /const status\s*=\s*[^;]*"On Leave"/.test(s) && s.includes("status,") && s.includes("PlannerAction"),
    (s) => s.replace(/const status\s*=\s*[^;]*;/, 'const status = undefined;'),
  ],
  [
    "LoadsPlanner supplies status per row",
    "loads",
    (s) => s.includes("status: load.status"),
    (s) => s.replace("status: load.status", ""),
  ],
  [
    "PlannerGrid CSS styles the status column",
    "css",
    (s) => /\.pg-col-status\b/.test(s) && /\.pg-frz-status\b/.test(s),
    (s) => s.replace(/\.pg-col-status\b/g, ".pg-col-statusX"),
  ],
];

function audit(sources) {
  return contracts
    .filter(([, key, test]) => {
      const input = sources[key];
      return !test(input);
    })
    .map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`[verify-planner-row-columns] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, key, , mutate] of contracts) {
    const mutated = { ...original, [key]: mutate(original[key]) };
    if (audit(mutated).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`[verify-planner-row-columns] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`);
  process.exit(0);
}

console.log("[verify-planner-row-columns] OK");
