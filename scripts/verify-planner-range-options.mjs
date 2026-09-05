#!/usr/bin/env node
/**
 * BRD-23 guard (owner 2026-09-05): planner filters/ranges format.
 * - PLANNER_RANGE_OPTIONS must be exactly [7, 14, 30] (no 40d)
 * - PlannerRangeToolbar must render a Custom option with date pickers
 * - Range buttons must have data-testid="planner-range-{N}d" and "planner-range-custom"
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

const failures = [];

// 1. planner-range.ts — PLANNER_RANGE_OPTIONS must be [7, 14, 30]
const plannerRange = read("apps/frontend/src/pages/dispatch/planners/planner-range.ts");
const rangeMatch = plannerRange.match(/export const PLANNER_RANGE_OPTIONS\s*=\s*\[([^\]]+)\]/);
if (!rangeMatch) {
  failures.push("planner-range.ts: PLANNER_RANGE_OPTIONS not found");
} else {
  const values = rangeMatch[1].split(",").map((v) => v.trim());
  const expected = ["7", "14", "30"];
  if (values.length !== 3 || values.some((v, i) => v !== expected[i])) {
    failures.push(`planner-range.ts: PLANNER_RANGE_OPTIONS must be [7, 14, 30] — got [${values.join(", ")}]`);
  }
  if (values.includes("40")) {
    failures.push("planner-range.ts: 40d preset must be removed (BRD-23 requires 7d/14d/30d/custom)");
  }
}

// 2. PlannerRangeToolbar — must have Custom option + date pickers
const toolbar = read("apps/frontend/src/pages/dispatch/planners/PlannerRangeToolbar.tsx");
if (!toolbar.includes('data-testid="planner-range-custom"')) {
  failures.push("PlannerRangeToolbar: missing data-testid=\"planner-range-custom\" button");
}
if (!toolbar.includes('data-testid="planner-range-custom-pickers"')) {
  failures.push("PlannerRangeToolbar: missing custom date pickers container");
}
if (!toolbar.includes("<DatePicker")) {
  failures.push("PlannerRangeToolbar: Custom range must use DatePicker for start/end");
}
if (!/data-testid=\{`planner-range-\$\{d\}d`\}/.test(toolbar)) {
  failures.push("PlannerRangeToolbar: missing dynamic data-testid={`planner-range-${d}d`} on range buttons");
}

if (failures.length) {
  console.error("FAIL verify-planner-range-options:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("PASS verify-planner-range-options — 7d/14d/30d/custom ranges (BRD-23)");
