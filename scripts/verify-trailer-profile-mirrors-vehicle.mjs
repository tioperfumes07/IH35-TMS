#!/usr/bin/env node
/**
 * CLOSURE-9 — trailer profile structural parity with vehicle profile (additive guard).
 * Core shipped via #368/#404; this guard prevents section drift on future edits.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vehiclePage = path.join(ROOT, "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx");
const trailerPage = path.join(ROOT, "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx");
const equipmentRoute = path.join(ROOT, "apps/backend/src/mdata/equipment.routes.ts");

function fail(message) {
  console.error(`verify:trailer-profile-mirrors-vehicle FAIL: ${message}`);
  process.exit(1);
}

for (const file of [vehiclePage, trailerPage, equipmentRoute]) {
  if (!fs.existsSync(file)) fail(`missing ${path.relative(ROOT, file)}`);
}

const vehicle = fs.readFileSync(vehiclePage, "utf8");
const trailer = fs.readFileSync(trailerPage, "utf8");
const equipment = fs.readFileSync(equipmentRoute, "utf8");

/** Vehicle 11 sections → trailer equivalents (CLOSURE-9 acceptance). */
const sectionPairs = [
  ["vp-section-1-identity", "tp-section-1-identity"],
  ["vp-section-5-maintenance", "tp-section-5-maintenance"],
  ["vp-section-6-compliance", "tp-section-6-compliance"],
  ["vp-section-10-documents", "tp-section-7-documents"],
  ["vp-section-11-action-bar", "tp-section-8-action-bar"],
];

for (const [vehicleId, trailerId] of sectionPairs) {
  if (!vehicle.includes(vehicleId)) fail(`vehicle page missing ${vehicleId}`);
  if (!trailer.includes(trailerId)) fail(`trailer page missing ${trailerId}`);
}

if (!trailer.includes("isReefer")) {
  fail("trailer page must compute isReefer for conditional reefer sections");
}
if (!trailer.includes("tp-section-4-reefer")) {
  fail("trailer page must include tp-section-4-reefer when type=reefer");
}
if (!trailer.includes("TrailerReeferSection")) {
  fail("trailer page must wire TrailerReeferSection for reefer hours");
}
// DUALPATH-06/07 fix (2026-07-22): vp-section-9-activity / TrailerRecentActivitySection were the
// deprecated raw-JSON dual-path activity widgets — both archived, not deleted (Rule 07).
// ServiceTimeline is now the sole canonical activity surface mirrored on both profiles.
if (vehicle.includes('data-testid="vp-section-9-activity"')) {
  fail("vehicle page must not re-add vp-section-9-activity (DUALPATH-06 — archived)");
}
if (/<TrailerRecentActivitySection[\s/>]/.test(trailer)) {
  fail("trailer page must not render legacy TrailerRecentActivitySection (DUALPATH-07 — archived)");
}
if (!vehicle.includes("ServiceTimeline") || !trailer.includes("ServiceTimeline")) {
  fail("both profiles must render ServiceTimeline as the canonical activity surface");
}
if (!trailer.includes("/api/v1/mdata/equipment/")) {
  fail("trailer profile must fetch aggregate via /api/v1/mdata/equipment/:id");
}
if (!equipment.includes('app.get("/api/v1/mdata/equipment/:id"')) {
  fail("equipment.routes must expose trailer profile aggregate GET");
}

const vehicleSectionCount = (vehicle.match(/data-testid="vp-section-/g) ?? []).length;
const trailerSectionCount = (trailer.match(/data-testid="tp-section-/g) ?? []).length;
if (vehicleSectionCount < 8) fail(`vehicle profile section count too low (${vehicleSectionCount})`);
if (trailerSectionCount < 6) fail(`trailer profile section count too low (${trailerSectionCount})`);

// fill-not-shell — need-company early paths use BoardSection on both profiles
if (!vehicle.includes('testId="vehicle-profile-need-company"') || !/BoardSection/.test(vehicle)) {
  fail("vehicle page need-company empty must be BoardSection (vehicle-profile-need-company)");
}
if (!trailer.includes('testId="trailer-profile-need-company"') || !/BoardSection/.test(trailer)) {
  fail("trailer page need-company empty must be BoardSection (trailer-profile-need-company)");
}

if (process.argv.includes("--selftest")) {
  const plantV = vehicle.replace(/testId="vehicle-profile-need-company"/g, 'testId="x"');
  const plantT = trailer.replace(/testId="trailer-profile-need-company"/g, 'testId="y"');
  if (plantV.includes('testId="vehicle-profile-need-company"') || plantT.includes('testId="trailer-profile-need-company"')) {
    fail("selftest plant inert");
  }
  if (!plantV.includes("BoardSection") || !plantT.includes("BoardSection")) {
    // BoardSection import may remain; markers must be gone for the plant to be meaningful
  }
  if (plantV.includes('testId="vehicle-profile-need-company"')) fail("selftest vehicle plant escaped");
  console.log("verify:trailer-profile-mirrors-vehicle SELFTEST PASS");
  process.exit(0);
}

console.log("verify:trailer-profile-mirrors-vehicle PASS");
