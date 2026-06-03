#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const routesFile = path.join(repoRoot, "apps/backend/src/mdata/units.routes.ts");
const pageFile = path.join(repoRoot, "apps/frontend/src/pages/maintenance/FleetTablePage.tsx");
const routesSource = fs.readFileSync(routesFile, "utf8");
const pageSource = fs.readFileSync(pageFile, "utf8");

if (!routesSource.includes("type: fleetTypeFilterSchema.optional()")) {
  console.error("[verify-type-filter-query-param] units.routes.ts missing type query schema");
  process.exit(1);
}

if (!pageSource.includes('params.set("type"') || !pageSource.includes("type=")) {
  console.error("[verify-type-filter-query-param] FleetTablePage must sync type query param");
  process.exit(1);
}

if (!pageSource.includes("parseFleetTypeFilter")) {
  console.error("[verify-type-filter-query-param] FleetTablePage must parse type from URL");
  process.exit(1);
}

console.log("[verify-type-filter-query-param] OK");
