#!/usr/bin/env node
/**
 * PlannerGrid FrozenName must always use the pg-name-cols split layout,
 * never the bare pg-name single-div that jams name/unit together.
 * PLAN-01-PLANNER-NAME-JAM fix — always render name in pg-col-name with
 * title truncation, even when secondary/unit/action are absent.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const filePath = path.join(root, "apps/frontend/src/pages/dispatch/planners/PlannerGrid.tsx");
const src = readFileSync(filePath, "utf8");

const failures = [];

// Forbidden: the bare pg-name single-div branch (the jam)
if (src.includes('return <div className="pg-name">')) {
  failures.push("FrozenName still has bare pg-name single-div branch (name/unit jam)");
}

// Required: always use pg-name-cols
if (!src.includes("pg-name pg-name-cols")) {
  failures.push("FrozenName missing pg-name-cols split layout");
}

// Required: name always wrapped in pg-col-name with title
if (!src.includes('className="pg-col-name"')) {
  failures.push("FrozenName missing pg-col-name wrapper for name");
}

if (process.argv.includes("--selftest")) {
  // Plant: remove pg-name-cols so the "always use split" check would fail
  const bad = src.replace("pg-name pg-name-cols", "pg-name-only");
  if (bad.includes("pg-name pg-name-cols")) {
    console.error("selftest: could not plant failure (pg-name-cols still present)");
    process.exit(1);
  }
  // Verify the guard would catch it: the required check for pg-name-cols would fail
  if (bad.includes("pg-name pg-name-cols")) {
    console.error("selftest: planted failure not detectable");
    process.exit(1);
  }
  console.log("verify-planner-frozen-name-always-split selftest: planted failure would be detected");
  process.exit(0);
}

if (failures.length) {
  console.error("verify-planner-frozen-name-always-split FAIL:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("verify-planner-frozen-name-always-split: OK — FrozenName always uses pg-name-cols split layout");
process.exit(0);
