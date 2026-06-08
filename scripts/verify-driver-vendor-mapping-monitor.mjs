#!/usr/bin/env node
import { readFileSync } from "fs";

const indexTs = readFileSync("apps/backend/src/index.ts", "utf8");
const integrityTab = readFileSync("apps/frontend/src/pages/safety/tabs/IntegrityReportsTab.tsx", "utf8");

const checks = [
  ["worker initialized", indexTs.includes("initializeDriverVendorMappingWorker")],
  ["routes registered", indexTs.includes("registerDriverVendorMappingIntegrityRoutes")],
  ["tab rendered", integrityTab.includes("DriverVendorMappingTab") || integrityTab.includes("driver-vendor-mapping")],
];
let failed = false;
for (const [label, ok] of checks) {
  if (ok) console.log(`✓ ${label}`);
  else { console.error(`✗ FAIL: ${label}`); failed = true; }
}
if (failed) process.exit(1);
console.log("GAP-52 driver-vendor mapping guard: PASS");
