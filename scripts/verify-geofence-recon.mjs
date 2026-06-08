#!/usr/bin/env node
/**
 * GAP-27 CI guard — verifies geofence reconciliation routes and worker are wired.
 */
import { readFileSync } from "fs";

const indexTs = readFileSync("apps/backend/src/index.ts", "utf8");

const checks = [
  ["geofence reconciliation routes registered", indexTs.includes("registerGeofenceReconciliationRoutes")],
  ["geofence reconciliation worker initialized", indexTs.includes("initializeGeofenceReconciliationWorker")],
];

let failed = false;
for (const [label, ok] of checks) {
  if (ok) { console.log(`✓ ${label}`); }
  else { console.error(`✗ FAIL: ${label}`); failed = true; }
}

if (failed) { console.error("GAP-27 CI guard failed"); process.exit(1); }
console.log("GAP-27 geofence reconciliation guard: PASS");
