#!/usr/bin/env node
import fs from "node:fs";

const page = fs.readFileSync("apps/frontend/src/pages/fuel/FuelPlannerHome.tsx", "utf8");
const checks = [
  ["planner aggregates API errors", /plannerError = dashboardQuery\.error \?\? activeRoutesQuery\.error \?\? settingsQuery\.error \?\? detailQuery\.error/.test(page)],
  ["degraded branch precedes planner data", /dashboardQuery\.isError \|\| activeRoutesQuery\.isError \|\| settingsQuery\.isError \|\| detailQuery\.isError \? \([\s\S]*?<ListErrorBanner/.test(page)],
  ["server failure is surfaced", /userFacingApiError\(plannerError/.test(page)],
  ["unavailable is not zero", page.includes("Planner values are unavailable — they are not zero.")],
  ["retry refetches planner sources", /dashboardQuery\.refetch\(\)[\s\S]*activeRoutesQuery\.refetch\(\)[\s\S]*settingsQuery\.refetch\(\)/.test(page)],
];
const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
if (failed.length) process.exit(1);
console.log(`verify-fuel-planner-degraded-honesty: ${checks.length}/${checks.length} PASS`);
