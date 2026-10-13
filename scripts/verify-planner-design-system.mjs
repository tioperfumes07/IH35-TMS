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

// 443.99 class B (CC-2, 2026-10-12) — selftest plants for the three active-fill contracts now replace EVERY
// `bg-[var(--planner-active)]` (old: only the first). BRD-23 (#20554) gave PlannerRangeToolbar a second active
// button (Custom range), so a first-only plant left one var fill behind and the planted regression "passed". The
// contract tests themselves are unchanged.
const contracts = [
  [
    "DispatchPlannersLayout tabs use CSS variable active fill and 28px height",
    "layout",
    (source) => source.includes("bg-[var(--planner-active)]") && source.includes("h-7") && source.includes("text-xs") && !source.includes("#14314F"),
    (source) => source.replaceAll("bg-[var(--planner-active)]", "bg-slate-800"),
  ],
  [
    "PlannerRangeToolbar active range button uses CSS variable and 28px height",
    "toolbar",
    (source) => source.includes("bg-[var(--planner-active)]") && source.includes("h-7") && source.includes("text-xs") && !source.includes("#14314F"),
    (source) => source.replaceAll("bg-[var(--planner-active)]", "bg-slate-800"),
  ],
  [
    "UnifiedTimelinePlanner + Book button uses CSS variable and 28px height",
    "unified",
    (source) => source.includes("bg-[var(--planner-active)]") && source.includes("h-7") && source.includes("text-xs") && !source.includes("#14314F"),
    (source) => source.replaceAll("bg-[var(--planner-active)]", "bg-slate-800"),
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
      keepsTwelvePxBody(source) &&
      source.includes("text-align: center;"),
    (source) =>
      source
        .replaceAll("font-size: 12px;", "font-size: 13px;")
        .replace(/font-size:\s*clamp\(\s*11px\s*,\s*([\d.]+)vw\s*,\s*13px\s*\)/g, "font-size: clamp(13px, $1vw, 15px)"),
  ],
];

// 443.99 class B (CC-2, 2026-10-12) — PlannerGrid body size.
//   old rule: PlannerGrid.css contains a literal `font-size: 12px;`.
//   new rule: the root .planner-grid-canonical block's font-size is either `12px` or a fluid
//             `clamp(Apx, Nvw, Bpx)` whose range still lands on the 12px baseline body (11 <= A <= 12 <= B <= 13).
//   why: the owner's standing APP-WIDE AUTOFIT ruling (2026-09-12, ROUND-20.7, #21933 836f61a854) made every
//        PlannerGrid font-size a clamp() so the planner scales with the window; there is no fixed 12px left to
//        match, though the body still reaches 12px. Not looser: a body that cannot render 12px (fixed 13px, or a
//        clamp that floors above 12 / caps below 12 or drifts past ±1px) still fails — the selftest plants it.
function keepsTwelvePxBody(source) {
  const root = (/\.planner-grid-canonical\s*\{([\s\S]*?)\n\}/.exec(source)?.[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  const decl = /(?:^|[;{\s])font-size:\s*([^;]+);/.exec(root)?.[1]?.trim() ?? "";
  if (decl === "12px") return true;
  const m = /^clamp\(\s*(\d+(?:\.\d+)?)px\s*,\s*[\d.]+vw\s*,\s*(\d+(?:\.\d+)?)px\s*\)$/.exec(decl);
  if (!m) return false;
  const [lo, hi] = [Number(m[1]), Number(m[2])];
  return lo >= 11 && lo <= 12 && hi >= 12 && hi <= 13;
}

const bodySizeCases = [
  [".planner-grid-canonical {\n  font-size: 12px;\n}", true],
  [".planner-grid-canonical {\n  font-size: clamp(11px, 0.85vw, 13px);\n}", true],
  [".planner-grid-canonical {\n  font-size: 13px;\n}", false],
  [".planner-grid-canonical {\n  font-size: clamp(13px, 1vw, 15px);\n}", false],
  [".planner-grid-canonical {\n  font-size: clamp(10px, 0.72vw, 11px);\n}", false],
  [".planner-grid-canonical {\n  font-size: clamp(9px, 0.72vw, 14px);\n}", false],
  [".planner-grid-canonical {\n  color: red;\n}", false],
  [".planner-grid-canonical {\n  /* example: font-size: 12px; */\n  font-size: 14px;\n}", false],
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
  for (const [css, expected] of bodySizeCases) {
    if (keepsTwelvePxBody(css) !== expected) throw new Error(`selftest body-size case wrong (expected ${expected}): ${css}`);
  }
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
