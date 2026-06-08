#!/usr/bin/env node
/**
 * GAP-26 CI guard — verifies border geofence worker + routes are wired.
 */
import { readFileSync } from "fs";

const indexTs = readFileSync("apps/backend/src/index.ts", "utf8");

const checks = [
  ["border-crossing detector routes registered", indexTs.includes("registerBorderCrossingDetectorRoutes")],
  ["border-crossing detector worker initialized", indexTs.includes("initializeBorderCrossingDetectorWorker")],
];

let failed = false;
for (const [label, ok] of checks) {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ FAIL: ${label}`);
    failed = true;
  }
}

if (failed) {
  console.error("GAP-26 CI guard failed");
  process.exit(1);
}
console.log("GAP-26 border geofence guard: PASS");
