#!/usr/bin/env node
/** Fill-not-shell — FactoringHome empty/loading, BatchWizard, Fuel planner settings states use BoardSection/FuelBoardSection. */
import fs from "node:fs";

const checks = [
  ["apps/frontend/src/pages/factoring/FactoringHome.tsx", "BoardSection", "factoring-home-loading", "FactoringHome loading"],
  ["apps/frontend/src/pages/factoring/FactoringHome.tsx", "BoardSection", "factoring-home-need-company", "FactoringHome need-company"],
  ["apps/frontend/src/pages/factoring/BatchWizard.tsx", "BoardSection", "factoring-batch-wizard-board", "BatchWizard body"],
  ["apps/frontend/src/pages/factoring/BatchWizard.tsx", "BoardSection", "factoring-batches-need-company", "BatchWizard need-company"],
  ["apps/frontend/src/pages/fuel/FuelPlannerHome.tsx", "FuelBoardSection", "fuel-planner-settings-loading", "Planner settings loading"],
  ["apps/frontend/src/pages/fuel/FuelPlannerHome.tsx", "FuelBoardSection", "fuel-planner-settings-unavailable", "Planner settings unavailable"],
];

const selftest = process.argv.includes("--selftest");

function analyze(sources) {
  const e = [];
  for (const [rel, tag, testId, label] of checks) {
    const src = sources[rel] ?? "";
    if (!src.includes(`<${tag}`) || !src.includes(`testId="${testId}"`)) {
      e.push(`${rel}: ${label} must use ${tag} (testId=${testId})`);
    }
  }
  return e;
}

const base = Object.fromEntries([...new Set(checks.map((c) => c[0]))].map((rel) => [rel, fs.readFileSync(rel, "utf8")]));

if (selftest) {
  const clean = analyze(base);
  if (clean.length) {
    console.error("SELFTEST FAIL live:\n- " + clean.join("\n- "));
    process.exit(1);
  }
  const planted = {
    ...base,
    "apps/frontend/src/pages/factoring/FactoringHome.tsx": base["apps/frontend/src/pages/factoring/FactoringHome.tsx"].replace(/<BoardSection/g, "<div"),
  };
  if (!analyze(planted).length) {
    console.error("SELFTEST FAIL plant escaped");
    process.exit(1);
  }
  console.log("PASS verify-fill-shell-empty-states --selftest");
  process.exit(0);
}

const fails = analyze(base);
if (fails.length) {
  console.error("FAIL verify-fill-shell-empty-states");
  fails.forEach((f) => console.error("- " + f));
  process.exit(1);
}
console.log("PASS verify-fill-shell-empty-states");
