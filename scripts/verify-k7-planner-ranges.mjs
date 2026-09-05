#!/usr/bin/env node
/**
 * K.7 BRD-23 guard — planner filters/ranges format + calendar RANGES present.
 *
 * Verifies:
 *   1. PLANNER_RANGE_OPTIONS includes 7, 14, 30 (days)
 *   2. Custom range option exists with date pickers
 *   3. PlannerRangeToolbar renders the range buttons with testids
 *   4. planner-range.ts has the BRD-23 comment marker
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-k7-planner-ranges";
const SELFTEST = process.argv.includes("--selftest");

const RANGE_TS = "apps/frontend/src/pages/dispatch/planners/planner-range.ts";
const TOOLBAR = "apps/frontend/src/pages/dispatch/planners/PlannerRangeToolbar.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertLive(overrides = {}) {
  const get = (rel) => overrides[rel] ?? read(rel);
  const problems = [];

  const rangeTs = get(RANGE_TS);
  if (!/\[7,\s*14,\s*30\]/.test(rangeTs)) {
    problems.push("planner-range.ts must define PLANNER_RANGE_OPTIONS with [7, 14, 30]");
  }
  if (!/BRD-23/.test(rangeTs)) {
    problems.push("planner-range.ts must have BRD-23 comment marker");
  }

  const toolbar = get(TOOLBAR);
  if (!/planner-range-\$\{d\}d/.test(toolbar)) {
    problems.push("PlannerRangeToolbar must render range buttons with planner-range-${d}d testid");
  }
  if (!/PLANNER_RANGE_OPTIONS/.test(toolbar)) {
    problems.push("PlannerRangeToolbar must import PLANNER_RANGE_OPTIONS");
  }
  if (!/planner-range-custom/.test(toolbar)) {
    problems.push("PlannerRangeToolbar must render Custom range button");
  }
  if (!/DatePicker/.test(toolbar)) {
    problems.push("PlannerRangeToolbar must use DatePicker for custom range");
  }
  if (!/planner-range-custom-pickers/.test(toolbar)) {
    problems.push("PlannerRangeToolbar must have custom range date pickers");
  }

  return problems;
}

if (SELFTEST) {
  const live = assertLive();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  // Mutation: remove 7 from range options
  const orig = read(RANGE_TS);
  const mutated = orig.replace("[7, 14, 30]", "[14, 30]");
  if (mutated === orig) {
    console.error(`${LABEL} SELFTEST FAILED: inert mutation`);
    process.exit(1);
  }
  if (!assertLive({ [RANGE_TS]: mutated }).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  // Mutation: remove custom button from toolbar
  const toolbarOrig = read(TOOLBAR);
  const toolbarMutated = toolbarOrig.replaceAll("planner-range-custom", "__PLANTED_K7_DEFECT__");
  if (toolbarMutated === toolbarOrig) {
    console.error(`${LABEL} SELFTEST FAILED: inert toolbar mutation`);
    process.exit(1);
  }
  if (!assertLive({ [TOOLBAR]: toolbarMutated }).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted toolbar defect not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 2/2 mutations caught`);
  process.exit(0);
}

const problems = assertLive();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — planner ranges 7d/14d/30d/custom with date pickers present`);
