#!/usr/bin/env node
/**
 * Owner 2026-09-04 design ruling guard for dispatch planner surfaces:
 * - Light, centred header backgrounds (#EEF2F6 / #E4EAF1) with regular ink (#1F2937).
 * - 1px #C7D2DC column rules.
 * - No hardcoded hex colours in planner TSX components.
 */
import fs from "node:fs";

const files = {
  tokens: "apps/frontend/src/pages/dispatch/planners/planner-design-tokens.css",
  css: "apps/frontend/src/pages/dispatch/planners/PlannerGrid.css",
  layout: "apps/frontend/src/pages/dispatch/planners/DispatchPlannersLayout.tsx",
  toolbar: "apps/frontend/src/pages/dispatch/planners/PlannerRangeToolbar.tsx",
  unified: "apps/frontend/src/pages/dispatch/planners/UnifiedTimelinePlanner.tsx",
  grid: "apps/frontend/src/pages/dispatch/planners/PlannerGrid.tsx",
};

const original = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]),
);

const contracts = [
  [
    "Planner design tokens define light header values",
    "tokens",
    (source) =>
      source.includes("--planner-th-bg: #eef2f6;") &&
      source.includes("--planner-th-ink: #1f2937;") &&
      source.includes("--planner-th-border: #c7d2dc;") &&
      source.includes("--planner-grp-bg: #e4eaf1;"),
    (source) => source.replace("--planner-th-bg: #eef2f6;", "--planner-th-bg: #ffffff;"),
  ],
  [
    "PlannerGrid CSS uses light header tokens and 1px column rules",
    "css",
    (source) =>
      source.includes("--th-bg: var(--planner-th-bg, #eef2f6);") &&
      source.includes("--th-border: var(--planner-th-border, #c7d2dc);") &&
      source.includes("--grp-bg: var(--planner-grp-bg, #e4eaf1);") &&
      source.includes("border-right: 1px solid var(--th-border);") &&
      source.includes("background: var(--th-bg);") &&
      source.includes("text-align: center;"),
    (source) => source.replace("--th-bg: var(--planner-th-bg, #eef2f6);", "--th-bg: #ffffff;"),
  ],
  [
    "No hardcoded #14314F hex in planner TSX components",
    ["layout", "toolbar", "unified", "grid"],
    (sources) =>
      !sources.layout.includes("#14314F") &&
      !sources.toolbar.includes("#14314F") &&
      !sources.unified.includes("#14314F") &&
      !sources.grid.includes("#14314F"),
    (sources) => ({ ...sources, layout: sources.layout + " #14314F" }),
  ],
  [
    "Today marker no longer uses aggressive navy fill",
    "css",
    (source) => !source.match(/\.pg-dh\.today\s*\{[^}]*background:\s*var\(--navy\)/),
    (source) => source.replace(".planner-grid-canonical .pg-dh.today {", ".planner-grid-canonical .pg-dh.today {\n  background: var(--navy);"),
  ],
];

function audit(sources) {
  return contracts
    .filter(([, key, test]) => {
      const input = Array.isArray(key) ? Object.fromEntries(key.map((k) => [k, sources[k]])) : sources[key];
      return !test(input);
    })
    .map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`[verify-planner-design-ruling-09-04] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, key, , mutate] of contracts) {
    const mutated = { ...original };
    if (Array.isArray(key)) {
      const result = mutate(original);
      for (const k of key) mutated[k] = result[k];
    } else {
      mutated[key] = mutate(original[key]);
    }
    if (audit(mutated).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`[verify-planner-design-ruling-09-04] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`);
  process.exit(0);
}

console.log("[verify-planner-design-ruling-09-04] OK");
