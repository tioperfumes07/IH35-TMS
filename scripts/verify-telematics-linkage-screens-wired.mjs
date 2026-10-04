#!/usr/bin/env node
/**
 * Linkage law, reverse direction, must reach a SCREEN: the load drawer, the truck profile and the driver
 * profile each mount the panel that reads the telematics reverse-link endpoints, and those endpoints are
 * registered. Fails if a mount, an endpoint string, or the backend registration disappears.
 */
import { readFileSync } from "node:fs";

const fe = "apps/frontend/src";
const SECTION_TABLE = `${fe}/components/telematics/TelematicsSectionTable.tsx`;
const checks = [
  [`${fe}/pages/fleet/VehicleProfilePage.tsx`, /<TelematicsLinksPanel kind="unit"/, "truck profile mounts the unit telematics panel"],
  [`${fe}/pages/drivers/DriverProfilePage.tsx`, /<DriverTelematicsPanel part="operations"/, "driver Loads tab mounts the operations panel"],
  [`${fe}/pages/drivers/DriverProfilePage.tsx`, /<DriverTelematicsPanel part="safety"/, "driver Safety tab mounts the safety panel"],
  [`${fe}/components/telematics/TelematicsLinksPanel.tsx`, /\/telematics\?/, "panel calls /api/v1/{loads|units}/:id/telematics"],
  [`${fe}/components/telematics/DriverTelematicsPanel.tsx`, /\/profile\/\$\{ep\}/, "driver panel calls /api/v1/drivers/:id/profile/*"],
  ["apps/backend/src/index.ts", /registerTelematicsLinkageRoutes\(app\)/, "backend registers the reverse-link routes"],
  ["apps/backend/src/index.ts", /registerDriverProfileTabRoutes\(app\)/, "backend registers the driver profile tab routes"],
];

function leftoverFails(src) {
  const fails = [];
  // BANK-F91381 leftover refuse — TelematicsSectionTable page-scoped text token ratchet
  if (src.includes("text-[11px]")) fails.push("TelematicsSectionTable.tsx: leftover text-[11px]");
  if (src.includes("#8A92AB")) fails.push("TelematicsSectionTable.tsx: leftover off-scale muted #8A92AB");
  return fails;
}

function run() {
  const fails = checks.filter(([f, re]) => !re.test(readFileSync(f, "utf8"))).map(([f, , what]) => `${what} (${f})`);
  fails.push(...leftoverFails(readFileSync(SECTION_TABLE, "utf8")));
  if (fails.length) {
    console.error("verify-telematics-linkage-screens-wired: FAIL\n  " + fails.join("\n  "));
    process.exit(1);
  }
  console.log(`verify-telematics-linkage-screens-wired: OK (${checks.length} links)`);
}

if (process.argv.includes("--selftest")) {
  const plant = readFileSync(SECTION_TABLE, "utf8") + '\n<div className="text-[11px] text-[#8A92AB]">plant</div>\n';
  const hits = leftoverFails(plant);
  if (!hits.some((e) => e.includes("leftover text-[11px]"))) {
    console.error("verify-telematics-linkage-screens-wired --selftest FAIL leftover plant escaped", hits);
    process.exit(1);
  }
  console.log("verify-telematics-linkage-screens-wired --selftest PASS — leftover plant detected");
  process.exit(0);
}

run();
