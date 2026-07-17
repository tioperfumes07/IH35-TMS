#!/usr/bin/env node
/**
 * Forbid redundant "Jump to tab" dropdown that duplicates FuelPlannerHome SUBNAV tabs.
 * Standard module pattern: SecondaryNavTabs row only (matches MaintenanceHome fix).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const fuelPlannerHomePath = path.join(ROOT, "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx");

const FORBIDDEN_MESSAGE =
  "Found Jump-to-tab dropdown duplicating Fuel sub-tab row. Use SecondaryNavTabs only.";

function fail(detail) {
  console.error(`verify:fuel-jump-to-tab-removed failed: ${FORBIDDEN_MESSAGE}`);
  if (detail) console.error(detail);
  process.exit(1);
}

if (!fs.existsSync(fuelPlannerHomePath)) {
  fail("missing FuelPlannerHome.tsx");
}

const source = fs.readFileSync(fuelPlannerHomePath, "utf8");

if (/jump to tab/i.test(source)) {
  fail("FuelPlannerHome.tsx still contains a 'Jump to tab' trigger label.");
}

if (source.includes('data-testid="fuel-jump-to-tab"')) {
  fail("FuelPlannerHome.tsx still has data-testid fuel-jump-to-tab.");
}

if (!source.includes("<SecondaryNavTabs")) {
  fail("FuelPlannerHome.tsx must render SecondaryNavTabs for standard Fuel tab navigation.");
}

const hoverDropdownBlocks = source.match(/<HoverDropdown\b[\s\S]*?<\/HoverDropdown>/g) ?? [];
for (const block of hoverDropdownBlocks) {
  if (/goToTab|SUBNAV/.test(block)) {
    fail("HoverDropdown in FuelPlannerHome still wires SUBNAV/goToTab tab jumping.");
  }
}

console.log("verify:fuel-jump-to-tab-removed: ok");
