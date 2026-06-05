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
if (!trailer.includes("TrailerRecentActivitySection")) {
  fail("trailer page must include recent activity (mirrors vp-section-9-activity)");
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

console.log("verify:trailer-profile-mirrors-vehicle PASS");
