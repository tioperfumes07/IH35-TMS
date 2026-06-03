#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const pageFile = path.join(repoRoot, "apps/frontend/src/pages/maintenance/FleetTablePage.tsx");
const optionsFile = path.join(repoRoot, "apps/frontend/src/components/fleet/fleetTypeFilter.ts");
const pageSource = fs.readFileSync(pageFile, "utf8");
const optionsSource = fs.readFileSync(optionsFile, "utf8");

const requiredOptions = [
  "All",
  "Truck",
  "Tractor",
  "Reefer",
  "DryVan",
  "Flatbed",
  "Stepdeck",
  "Lowboy",
  "Tanker",
  "Custom",
];

if (!pageSource.includes('id="fleet-type-filter"')) {
  console.error("[verify-fleet-type-filter-dropdown] FleetTablePage missing fleet-type-filter select");
  process.exit(1);
}

for (const option of requiredOptions) {
  if (!optionsSource.includes(`label: "${option}"`)) {
    console.error(`[verify-fleet-type-filter-dropdown] Missing dropdown option ${option}`);
    process.exit(1);
  }
}

if (!pageSource.includes("FLEET_TYPE_FILTER_OPTIONS")) {
  console.error("[verify-fleet-type-filter-dropdown] FleetTablePage must use FLEET_TYPE_FILTER_OPTIONS");
  process.exit(1);
}

console.log("[verify-fleet-type-filter-dropdown] OK");
