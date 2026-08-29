#!/usr/bin/env node
import fs from "node:fs";

const files = {
  backend: "apps/backend/src/fuel/planner.routes.ts",
  api: "apps/frontend/src/api/fuelPlanner.ts",
  page: "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function failures(s) {
  const out = [];
  if (!s.backend.includes("activeRoutesQuerySchema") || !s.backend.includes("count(*)::int AS total_count")) out.push("active routes need an exact count");
  if (!s.backend.includes("ORDER BY computed_at DESC, id DESC") || !s.backend.includes("LIMIT $2 OFFSET $3")) out.push("active routes need stable bounded paging");
  if (!s.api.includes("{ routes: FuelActiveRoute[]; total_count: number | null;") || !s.api.includes("&limit=${range.limit}&offset=${range.offset}")) out.push("API must carry range and exact total-or-unavailable contract");
  if (!s.page.includes('activeRoutePage, setActiveRoutePage') || !s.page.includes('activeRoutePageCount')) out.push("mounted planner needs controlled server paging");
  if (!s.page.includes('data-testid="fuel-active-route-selector"') || !s.page.includes("setSelectedActiveRouteId")) out.push("operator must be able to choose the active plan");
  if (/routes\?\.\[0\]/.test(s.page)) out.push("planner must not silently force the first route");
  return out;
}

if (process.argv.includes("--selftest")) {
  const baseline = failures(source);
  if (baseline.length) {
    console.error(`FAIL: selftest baseline is red: ${baseline.join("; ")}`);
    process.exit(1);
  }
  const mutations = [
    { ...source, backend: source.backend.replace("count(*)::int AS total_count", "1::int AS total_count") },
    { ...source, backend: source.backend.replace("LIMIT $2 OFFSET $3", "LIMIT 100") },
    { ...source, api: source.api.replace("{ routes: FuelActiveRoute[]; total_count: number | null;", "{ routes: FuelActiveRoute[];") },
    { ...source, page: source.page.replace('data-testid="fuel-active-route-selector"', 'data-testid="disabled"') },
    { ...source, page: `${source.page}\nconst regression = routes?.[0];` },
  ];
  const missed = mutations.filter((mutation) => failures(mutation).length === 0).length;
  if (missed) {
    console.error(`FAIL: selftest missed ${missed}/${mutations.length} planted regressions`);
    process.exit(1);
  }
  console.log(`PASS: selftest caught ${mutations.length}/${mutations.length} active-route regressions`);
  process.exit(0);
}

const found = failures(source);
if (found.length) {
  console.error(`FAIL: ${found.join("; ")}`);
  process.exit(1);
}
console.log("PASS: Fuel planner exposes every active route through exact stable server paging and selection");
