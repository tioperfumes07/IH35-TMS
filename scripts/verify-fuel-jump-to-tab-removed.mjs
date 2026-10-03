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

function fuelNavigationFailures(source) {
  const failures = [];
  if (/jump to tab/i.test(source)) failures.push("FuelPlannerHome.tsx still contains a 'Jump to tab' trigger label.");
  if (source.includes('data-testid="fuel-jump-to-tab"')) failures.push("FuelPlannerHome.tsx still has data-testid fuel-jump-to-tab.");
  if (!source.includes("<NavyPageSubNav")) failures.push("FuelPlannerHome.tsx must render NavyPageSubNav for standard Fuel tab navigation.");
  if (source.includes("text-[11px]")) failures.push("leftover text-[11px]");
  if (source.includes("#8A92AB") || source.includes("#334155")) failures.push("leftover off-scale muted");

  const hoverDropdownBlocks = source.match(/<HoverDropdown\b[\s\S]*?<\/HoverDropdown>/g) ?? [];
  for (const block of hoverDropdownBlocks) {
    if (/goToTab|SUBNAV/.test(block)) failures.push("HoverDropdown in FuelPlannerHome still wires SUBNAV/goToTab tab jumping.");
  }
  return failures;
}

if (!fs.existsSync(fuelPlannerHomePath)) {
  fail("missing FuelPlannerHome.tsx");
}

const source = fs.readFileSync(fuelPlannerHomePath, "utf8");

const failures = fuelNavigationFailures(source);
if (failures.length) fail(failures.join("\n"));

console.log("verify:fuel-jump-to-tab-removed: ok");

if (process.argv.includes("--selftest")) {
  const wrongNav = source.replaceAll("NavyPageSubNav", "SecondaryNavTabs");
  const duplicateJump = `${source}\nconst plantedLabel = "Jump to tab";`;
  if (!fuelNavigationFailures(wrongNav).some((message) => message.includes("NavyPageSubNav"))) {
    fail("selftest wrong navigation primitive mutation escaped");
  }
  if (!fuelNavigationFailures(duplicateJump).some((message) => message.includes("Jump to tab"))) {
    fail("selftest duplicate Jump-to-tab mutation escaped");
  }
  const leftoverPlant = `${source}\n<div className="text-[11px] text-[#8A92AB]">plant</div>`;
  if (!fuelNavigationFailures(leftoverPlant).some((message) => message.includes("leftover"))) {
    fail("selftest leftover plant escaped");
  }
  console.log("verify:fuel-jump-to-tab-removed SELFTEST PASS (3/3 planted defects rejected)");
}
