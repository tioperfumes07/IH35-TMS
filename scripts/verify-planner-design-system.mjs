#!/usr/bin/env node
/**
 * GO-23 PR 3 guard (owner 2026-09-04): apply GLOBAL-TYPE-SIZE-BASELINE.md to dispatch planner surfaces.
 */
import fs from "node:fs";

const files = {
  layout: "apps/frontend/src/pages/dispatch/planners/DispatchPlannersLayout.tsx",
  toolbar: "apps/frontend/src/pages/dispatch/planners/PlannerRangeToolbar.tsx",
  unified: "apps/frontend/src/pages/dispatch/planners/UnifiedTimelinePlanner.tsx",
  grid: "apps/frontend/src/pages/dispatch/planners/PlannerGrid.tsx",
  css: "apps/frontend/src/pages/dispatch/planners/PlannerGrid.css",
};

const original = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]),
);

const contracts = [
  [
    "DispatchPlannersLayout tabs use CSS variable active fill and 28px height",
    "layout",
    (source) => source.includes("bg-[var(--planner-active)]") && source.includes("h-7") && source.includes("text-xs") && !source.includes("#14314F"),
    (source) => source.replace("bg-[var(--planner-active)]", "bg-slate-800"),
  ],
  [
    "PlannerRangeToolbar active range button uses CSS variable and 28px height",
    "toolbar",
    (source) => source.includes("bg-[var(--planner-active)]") && source.includes("h-7") && source.includes("text-xs") && !source.includes("#14314F"),
    (source) => source.replace("bg-[var(--planner-active)]", "bg-slate-800"),
  ],
  [
    "UnifiedTimelinePlanner + Book button uses CSS variable and 28px height",
    "unified",
    (source) => source.includes("bg-[var(--planner-active)]") && source.includes("h-7") && source.includes("text-xs") && !source.includes("#14314F"),
    (source) => source.replace("bg-[var(--planner-active)]", "bg-slate-800"),
  ],
  [
    "PlannerGrid card uses baseline border color (border-gray-200)",
    "grid",
    (source) => source.includes("border-gray-200") && source.includes("text-gray-500"),
    (source) => source.replace("border-gray-200", "border-slate-300"),
  ],
  [
    "PlannerGrid CSS maps active colour through a CSS variable and keeps 12px body",
    "css",
    (source) =>
      source.includes("--nb: var(--planner-active, #14314f);") &&
      source.includes("font-size: 12px;") &&
      source.includes("text-align: center;"),
    (source) => source.replaceAll("font-size: 12px;", "font-size: 13px;"),
  ],
];

function audit(sources) {
  return contracts.filter(([, key, test]) => !test(sources[key])).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`[verify-planner-design-system] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, key, , mutate] of contracts) {
    const mutated = { ...original, [key]: mutate(original[key]) };
    if (audit(mutated).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`[verify-planner-design-system] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`);
  process.exit(0);
}

console.log("[verify-planner-design-system] OK");
