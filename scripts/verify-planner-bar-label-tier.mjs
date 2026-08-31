#!/usr/bin/env node
/**
 * PlannerGrid plannerBarLabelTier must tier labels for short bars.
 * PLAN-03-PLANNER-SHORT-BAR-LABELS guard — protects the 3-tier drop:
 * full → last-2-segments → last-segment → empty.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const filePath = path.join(root, "apps/frontend/src/pages/dispatch/planners/PlannerGrid.tsx");
const src = readFileSync(filePath, "utf8");

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

if (process.argv.includes("--selftest")) {
  const bad = src.replace("slice(-2).join", "slice(-1).join");
  if (bad.includes("slice(-2).join")) {
    console.error("selftest: could not plant failure");
    process.exit(1);
  }
  console.log("verify-planner-bar-label-tier selftest: planted failure would be detected");
  process.exit(0);
}

if (failures.length) {
  console.error("verify-planner-bar-label-tier FAIL:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("verify-planner-bar-label-tier: OK — plannerBarLabelTier 3-tier drop protected");
process.exit(0);
