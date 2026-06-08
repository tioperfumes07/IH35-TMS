#!/usr/bin/env node
/**
 * GAP-29 CI guard — verifies booking gap routes and worker are wired in index.ts.
 */
import { readFileSync } from "fs";

const indexTs = readFileSync("apps/backend/src/index.ts", "utf8");

const checks = [
  ["booking gap routes registered", indexTs.includes("registerBookingGapRoutes")],
  ["booking gap worker initialized", indexTs.includes("initializeBookingGapAggregatorWorker")],
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
  console.error("GAP-29 CI guard failed");
  process.exit(1);
}
console.log("GAP-29 booking gap analytics guard: PASS");
