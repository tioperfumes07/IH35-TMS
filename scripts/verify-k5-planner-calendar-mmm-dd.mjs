#!/usr/bin/env node
/**
 * K.5 BRD-20 guard — planner calendar dates as MMM-DD, pronounced column lines.
 *
 * Verifies:
 *   1. PlannerAxisHead uses formatPlannerDayLabel (MMM-DD format, not bare day number)
 *   2. PlannerAxisHead does NOT render bare Number(d.slice(8,10)) as the date
 *   3. Column lines are pronounced (border-l on day headers)
 *   4. formatPlannerDayLabel is imported in PlannerAxisHead
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-k5-planner-calendar-mmm-dd";
const SELFTEST = process.argv.includes("--selftest");

const AXIS_HEAD = "apps/frontend/src/pages/dispatch/planners/PlannerAxisHead.tsx";
const AXIS_TS = "apps/frontend/src/pages/dispatch/planners/plannerTimeAxis.ts";
const DAY_LABEL = "apps/frontend/src/pages/dispatch/planners/plannerDayLabel.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertLive(overrides = {}) {
  const get = (rel) => overrides[rel] ?? read(rel);
  const problems = [];

  const axisHead = get(AXIS_HEAD);
  if (!/formatPlannerDayLabel/.test(axisHead)) {
    problems.push("PlannerAxisHead must import formatPlannerDayLabel");
  }
  if (!/formatPlannerDayLabel\(d\)/.test(axisHead)) {
    problems.push("PlannerAxisHead must call formatPlannerDayLabel(d) for date rendering");
  }
  // Must NOT render bare day number as the primary date
  if (/\{Number\(d\.slice\(8,\s*10\)\)\}/.test(axisHead)) {
    problems.push("PlannerAxisHead must not render bare Number(d.slice(8,10)) — use MMM-DD instead");
  }
  // Must have pronounced column lines (border-l on day headers)
  if (!/border-l/.test(axisHead)) {
    problems.push("PlannerAxisHead must have border-l for pronounced column lines");
  }
  // BANK-F91302 leftover refuse — PlannerAxisHead.tsx page-scoped text token ratchet
  if (axisHead.includes("text-[11px]")) problems.push(`${AXIS_HEAD}: leftover text-[11px]`);
  if (axisHead.includes("#8A92AB") || axisHead.includes("#334155")) problems.push(`${AXIS_HEAD}: leftover off-scale muted`);

  // BANK-F91487 leftover refuse — plannerTimeAxis.ts today-inset leftover muted
  const axisTs = get(AXIS_TS);
  if (axisTs.includes("text-[11px]")) problems.push(`${AXIS_TS}: leftover text-[11px]`);
  if (axisTs.includes("#8A92AB") || axisTs.includes("#334155")) problems.push(`${AXIS_TS}: leftover off-scale muted`);

  // formatPlannerDayLabel must produce MMM-DD format
  const dayLabel = get(DAY_LABEL);
  if (!/MONTH_ABBR/.test(dayLabel)) {
    problems.push("plannerDayLabel must define MONTH_ABBR for MMM-DD format");
  }
  if (!/SEPT/.test(dayLabel)) {
    problems.push("plannerDayLabel must use SEPT (4 letters) for September per owner spec");
  }

  return problems;
}

if (SELFTEST) {
  const live = assertLive();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  // Mutation: remove formatPlannerDayLabel import
  const orig = read(AXIS_HEAD);
  const mutated = orig.replaceAll("formatPlannerDayLabel", "__PLANTED_K5_DEFECT__");
  if (mutated === orig) {
    console.error(`${LABEL} SELFTEST FAILED: inert mutation`);
    process.exit(1);
  }
  if (!assertLive({ [AXIS_HEAD]: mutated }).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  // Mutation: reintroduce bare day number
  const bareDay = orig.replace("formatPlannerDayLabel(d)", 'Number(d.slice(8, 10))');
  if (!assertLive({ [AXIS_HEAD]: bareDay }).includes("PlannerAxisHead must call formatPlannerDayLabel(d) for date rendering")) {
    console.error(`${LABEL} SELFTEST FAILED: bare day number not caught`);
    process.exit(1);
  }
  // BANK-F91302 leftover plant — PlannerAxisHead page-scoped text token ratchet
  const leftoverPlant = orig + '\n<div className="text-[11px] text-[#8A92AB]">plant</div>\n';
  const leftoverHits = assertLive({ [AXIS_HEAD]: leftoverPlant });
  if (!leftoverHits.some((e) => e.includes("leftover text-[11px]")) || !leftoverHits.some((e) => e.includes("leftover off-scale muted"))) {
    console.error(`${LABEL} SELFTEST FAILED leftover plant escaped`, leftoverHits.filter((e) => e.includes("leftover")));
    process.exit(1);
  }
  const axisTsPlant = read(AXIS_TS) + '\n<div className="text-[11px] text-[#8A92AB]" style={{ color: "#334155" }}>plant</div>\n';
  const axisTsHits = assertLive({ [AXIS_TS]: axisTsPlant });
  if (
    !axisTsHits.some((e) => e.includes(`${AXIS_TS}: leftover text-[11px]`)) ||
    !axisTsHits.some((e) => e.includes(`${AXIS_TS}: leftover off-scale muted`))
  ) {
    console.error(`${LABEL} SELFTEST FAILED leftover axis-ts plant escaped`, axisTsHits.filter((e) => e.includes("leftover")));
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 2/2 mutations caught + leftover plant`);
  process.exit(0);
}

const problems = assertLive();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — planner calendar dates render MMM-DD with pronounced column lines`);
