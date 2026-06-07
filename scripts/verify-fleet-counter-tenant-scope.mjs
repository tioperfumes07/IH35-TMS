#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const homePagePath = path.join(ROOT, "apps/frontend/src/pages/home/roles/DefaultHome.tsx");
const reportsRoutePath = path.join(ROOT, "apps/backend/src/reports/library.routes.ts");

function fail(message) {
  console.error(`verify:fleet-counter-tenant-scope FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(homePagePath)) {
  fail("missing apps/frontend/src/pages/home/HomePage.tsx");
}
if (!fs.existsSync(reportsRoutePath)) {
  fail("missing apps/backend/src/reports/library.routes.ts");
}

const homeText = fs.readFileSync(homePagePath, "utf8");
if (/label:\s*"Vehicles in Service"[\s\S]*number:\s*"94"/m.test(homeText)) {
  fail("Vehicles in Service card must not use hardcoded 94");
}
if (!/label:\s*"Vehicles in Service"[\s\S]*kpiSummaryQuery\.data\?\.live_units/m.test(homeText)) {
  fail("Vehicles in Service card must read tenant-scoped live_units from API");
}

const reportsText = fs.readFileSync(reportsRoutePath, "utf8");
const requiredFragments = [
  "const liveUnitsRes = await client.query(",
  "FROM mdata.units u",
  "AND (u.owner_company_id = $1 OR u.currently_leased_to_company_id = $1)",
  "live_units: Number(((liveUnitsRes.rows[0]",
];
for (const fragment of requiredFragments) {
  if (!reportsText.includes(fragment)) {
    fail(`kpi-summary route missing tenant-scoped live_units fragment: ${fragment}`);
  }
}

console.log("verify:fleet-counter-tenant-scope OK");
