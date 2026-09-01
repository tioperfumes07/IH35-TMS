#!/usr/bin/env node
/**
 * PlannerGrid plannerBarLabelTier must tier labels for short bars.
 * PLAN-03-PLANNER-SHORT-BAR-LABELS guard — protects the 3-tier drop:
 * full → last-2-segments → last-segment → empty.
 * PLN-03 — HosTracker + DriverScheduler day headers use formatPlannerDayLabel (Aug 21, not 08-21).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const filePath = path.join(root, "apps/frontend/src/pages/dispatch/planners/PlannerGrid.tsx");
const src = readFileSync(filePath, "utf8");

const PLN03_FILES = [
  "apps/frontend/src/pages/compliance/HosTrackerSection.tsx",
  "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx",
];

const failures = [];

// Required: plannerBarLabelTier exported
if (!src.includes("export function plannerBarLabelTier")) {
  failures.push("plannerBarLabelTier not exported from PlannerGrid");
}

// Required: 3-tier drop logic
if (!src.includes("fits(label)")) {
  failures.push("missing full-label tier check");
}
if (!src.includes("slice(-2).join")) {
  failures.push("missing last-2-segments tier");
}
if (!src.includes("parts[parts.length - 1]")) {
  failures.push("missing last-segment tier");
}
if (!src.includes('return ""')) {
  failures.push("missing empty fallback for too-narrow bars");
}

// Required: CHAR_PX and BAR_PAD constants for deterministic sizing
if (!src.includes("CHAR_PX")) {
  failures.push("missing CHAR_PX constant");
}
if (!src.includes("BAR_PAD")) {
  failures.push("missing BAR_PAD constant");
}

function pln03DayLabelIssues(fileSources) {
  const issues = [];
  const labelHelper = path.join(root, "apps/frontend/src/pages/dispatch/planners/plannerDayLabel.ts");
  const helperSrc = readFileSync(labelHelper, "utf8");
  if (!helperSrc.includes("export function formatPlannerDayLabel")) {
    issues.push("plannerDayLabel.ts must export formatPlannerDayLabel (PLN-03)");
  }
  for (const rel of PLN03_FILES) {
    const fileSrc = fileSources?.[rel] ?? readFileSync(path.join(root, rel), "utf8");
    if (!/formatPlannerDayLabel\s*\(/.test(fileSrc)) {
      issues.push(`${rel}: must call formatPlannerDayLabel(isoYmd) for day headers (PLN-03)`);
    }
    if (/\.slice\(5\)/.test(fileSrc)) {
      issues.push(`${rel}: must not render YYYY-MM-DD via .slice(5) — use formatPlannerDayLabel (PLN-03)`);
    }
  }
  return issues;
}

function pln04HosStripIssues(fileSources) {
  const issues = [];
  const rel = PLN03_FILES[0];
  const fileSrc = fileSources?.[rel] ?? readFileSync(path.join(root, rel), "utf8");
  if (!fileSrc.includes("8-day day-strip selector")) {
    issues.push(`${rel}: missing 8-day day-strip selector block (PLN-04)`);
    return issues;
  }
  const stripWindow = fileSrc.split("8-day day-strip selector")[1]?.slice(0, 900) ?? "";
  if (!/formatPlannerDayLabel\s*\(\s*d\.date\s*\)/.test(stripWindow)) {
    issues.push(`${rel}: 8-day strip cells must call formatPlannerDayLabel(d.date) (PLN-04)`);
  }
  if (/\{d\.mon\}/.test(stripWindow) || /\{d\.day\}/.test(stripWindow)) {
    issues.push(`${rel}: 8-day strip must not render split mon/day tokens — use formatPlannerDayLabel (PLN-04)`);
  }
  return issues;
}

failures.push(...pln03DayLabelIssues());
failures.push(...pln04HosStripIssues());

if (process.argv.includes("--selftest")) {
  const bad = src.replace("slice(-2).join", "slice(-1).join");
  if (bad.includes("slice(-2).join")) {
    console.error("selftest: could not plant bar-label failure");
    process.exit(1);
  }
  const hosPath = path.join(root, PLN03_FILES[0]);
  const hosSrc = readFileSync(hosPath, "utf8");
  const pln03Mutants = [
    { [PLN03_FILES[0]]: hosSrc.replace(/formatPlannerDayLabel\s*\([^)]*\)/g, "day.date.slice(5)") },
    { [PLN03_FILES[0]]: hosSrc.replace(/formatPlannerDayLabel\s*\([^)]*\)/g, '"—"') },
  ];
  const pln04Mutants = [
    {
      [PLN03_FILES[0]]: hosSrc.replace(
        /formatPlannerDayLabel\s*\(\s*d\.date\s*\)/,
        "{d.mon} {d.day}"
      ),
    },
  ];
  if (!pln03Mutants.every((sources) => pln03DayLabelIssues(sources).length > 0)) {
    console.error("selftest: PLN-03 mutation escaped");
    process.exit(1);
  }
  if (!pln04Mutants.every((sources) => pln04HosStripIssues(sources).length > 0)) {
    console.error("selftest: PLN-04 strip mutation escaped");
    process.exit(1);
  }
  console.log("verify-planner-bar-label-tier selftest: bar-label + PLN-03 + PLN-04 defects caught");
  process.exit(0);
}

if (failures.length) {
  console.error("verify-planner-bar-label-tier FAIL:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("verify-planner-bar-label-tier: OK — plannerBarLabelTier + PLN-03 day labels + PLN-04 HOS strip protected");
process.exit(0);
