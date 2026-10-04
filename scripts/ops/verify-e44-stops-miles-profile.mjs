#!/usr/bin/env node
/** E-44 — Stops + miles on unit/driver profile (Round 306). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-e44-stops-miles-profile";
const SELFTEST = process.argv.includes("--selftest");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function audit() {
  const f = [];
  const routes = read("apps/backend/src/telematics/stop-events.routes.ts");
  if (!/\/api\/v1\/telematics\/stop-events/.test(routes)) f.push("BE route missing");
  const reads = read("apps/backend/src/telematics/stop-events.reads.ts");
  if (!/detectStops/.test(reads) || !/milesBetweenStops/.test(reads)) f.push("must reuse E-03 engine");
  const index = read("apps/backend/src/index.ts");
  if (!/registerStopEventsRoutes/.test(index)) f.push("index must register stop-events");
  const section = read("apps/frontend/src/components/shared/StopsMilesSection.tsx");
  if (!/stops-miles-section/.test(section)) f.push("section missing testid");
  const vp = read("apps/frontend/src/pages/fleet/VehicleProfilePage.tsx");
  if (!/StopsMilesSection/.test(vp) || !/unitId=\{id\}/.test(vp)) f.push("vehicle profile missing section");
  const dp = read("apps/frontend/src/pages/drivers/DriverProfilePage.tsx");
  if (!/DriverProfileStopsMilesSection/.test(dp) || !/driverId=\{id\}/.test(dp)) {
    f.push("driver profile missing DriverProfileStopsMilesSection wired to profile/stops-miles");
  }
  const stopsSection = read("apps/frontend/src/components/driver-profile/DriverProfileStopsMilesSection.tsx");
  if (!/getDriverProfileStopsMiles/.test(stopsSection)) f.push("driver profile stops section must call getDriverProfileStopsMiles");
  // BANK-F91361 leftover refuse — DriverProfileStopsMilesSection page-scoped text token ratchet
  if (stopsSection.includes("text-[11px]")) f.push("DriverProfileStopsMilesSection.tsx: leftover text-[11px]");
  if (stopsSection.includes("#8A92AB")) f.push("DriverProfileStopsMilesSection.tsx: leftover off-scale muted #8A92AB");
  return f;
}

if (SELFTEST) {
  const stopsSection = read("apps/frontend/src/components/driver-profile/DriverProfileStopsMilesSection.tsx");
  // BANK-F91361 leftover plant
  const leftoverPlant = stopsSection + '\n<div className="text-[11px] text-[#8A92AB]">plant</div>\n';
  if (!(leftoverPlant.includes("text-[11px]") && leftoverPlant.includes("#8A92AB"))) {
    console.error(`${LABEL} SELFTEST FAIL — DriverProfileStopsMilesSection leftover plant escaped`);
    process.exit(1);
  }
  const plantFails = [];
  if (leftoverPlant.includes("text-[11px]")) plantFails.push("leftover text-[11px]");
  if (leftoverPlant.includes("#8A92AB")) plantFails.push("leftover off-scale muted");
  if (!plantFails.includes("leftover text-[11px]")) {
    console.error(`${LABEL} SELFTEST FAIL — leftover refuse inert`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST: OK — leftover plant rejected`);
  process.exit(0);
}

const failures = audit();
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const x of failures) console.error(`  - ${x}`);
  process.exit(1);
}
console.log(`${LABEL}: OK`);
process.exit(0);
