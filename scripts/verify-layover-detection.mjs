#!/usr/bin/env node
/**
 * GAP-28 CI guard — verifies layover detection worker and routes are wired.
 */
import { readFileSync } from "fs";

const indexTs = readFileSync("apps/backend/src/index.ts", "utf8");

const checks = [
  ["layover routes registered", indexTs.includes("registerLayoverRoutes")],
  ["layover worker initialized", indexTs.includes("initializeLayoverDetectorWorker")],
];

let failed = false;
for (const [label, ok] of checks) {
  if (ok) { console.log(`✓ ${label}`); }
  else { console.error(`✗ FAIL: ${label}`); failed = true; }
}

if (failed) { console.error("GAP-28 CI guard failed"); process.exit(1); }
console.log("GAP-28 layover detection guard: PASS");
