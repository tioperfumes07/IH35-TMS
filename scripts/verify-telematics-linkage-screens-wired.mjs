#!/usr/bin/env node
/**
 * Linkage law, reverse direction, must reach a SCREEN: the load drawer, the truck profile and the driver
 * profile each mount the panel that reads the telematics reverse-link endpoints, and those endpoints are
 * registered. Fails if a mount, an endpoint string, or the backend registration disappears.
 */
import { readFileSync } from "node:fs";

const fe = "apps/frontend/src";
const checks = [
  [`${fe}/components/dispatch/LoadDetailDrawer.tsx`, /<TelematicsLinksPanel kind="load"/, "load drawer mounts the load telematics panel"],
  [`${fe}/pages/fleet/VehicleProfilePage.tsx`, /<TelematicsLinksPanel kind="unit"/, "truck profile mounts the unit telematics panel"],
  [`${fe}/pages/drivers/DriverProfilePage.tsx`, /<DriverTelematicsPanel part="operations"/, "driver Loads tab mounts the operations panel"],
  [`${fe}/pages/drivers/DriverProfilePage.tsx`, /<DriverTelematicsPanel part="safety"/, "driver Safety tab mounts the safety panel"],
  [`${fe}/components/telematics/TelematicsLinksPanel.tsx`, /\/telematics\?/, "panel calls /api/v1/{loads|units}/:id/telematics"],
  [`${fe}/components/telematics/DriverTelematicsPanel.tsx`, /\/profile\/\$\{ep\}/, "driver panel calls /api/v1/drivers/:id/profile/*"],
  ["apps/backend/src/index.ts", /registerTelematicsLinkageRoutes\(app\)/, "backend registers the reverse-link routes"],
  ["apps/backend/src/index.ts", /registerDriverProfileTabRoutes\(app\)/, "backend registers the driver profile tab routes"],
];
const fails = checks.filter(([f, re]) => !re.test(readFileSync(f, "utf8"))).map(([f, , what]) => `${what} (${f})`);
if (fails.length) { console.error("verify-telematics-linkage-screens-wired: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`verify-telematics-linkage-screens-wired: OK (${checks.length} links)`);
