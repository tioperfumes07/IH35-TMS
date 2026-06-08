#!/usr/bin/env node
import { readFileSync } from "fs";

const indexTs = readFileSync("apps/backend/src/index.ts", "utf8");
const dispatchBoard = readFileSync("apps/frontend/src/pages/dispatch/DispatchBoard.tsx", "utf8");
const manifest = readFileSync("apps/frontend/src/routes/manifest.tsx", "utf8");
const appTsx = readFileSync("apps/driver-pwa/src/App.tsx", "utf8");

const checks = [
  ["poll worker", indexTs.includes("initializeSamsaraPositionPollWorker")],
  ["live position routes", indexTs.includes("registerSamsaraLivePositionRoutes")],
  ["dispatch board GPS column", dispatchBoard.includes("LoadLivePositionCell") || dispatchBoard.includes("Live GPS")],
  ["map route", manifest.includes("MapView") || manifest.includes("/dispatch/map")],
  ["PWA MyPosition", appTsx.includes("MyPosition")],
];
let failed = false;
for (const [label, ok] of checks) {
  if (ok) console.log(`✓ ${label}`);
  else { console.error(`✗ FAIL: ${label}`); failed = true; }
}
if (failed) process.exit(1);
console.log("GAP-55 CAP-1 live GPS guard: PASS");
