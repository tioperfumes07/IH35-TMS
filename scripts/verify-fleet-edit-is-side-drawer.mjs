#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const FILES = {
  vehicleEdit: "apps/frontend/src/components/fleet/EditVehicleModal.tsx",
  trailerEdit: "apps/frontend/src/components/fleet/EditTrailerModal.tsx",
  vehicleProfile: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
  trailerProfile: "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx",
};

function read(rel, override = new Map()) {
  return override.get(rel) ?? fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function verify(override = new Map()) {
  const errors = [];
  const vehicleEdit = read(FILES.vehicleEdit, override);
  const trailerEdit = read(FILES.trailerEdit, override);
  const vehicleProfile = read(FILES.vehicleProfile, override);
  const trailerProfile = read(FILES.trailerProfile, override);
  for (const [label, source] of [["vehicle editor", vehicleEdit], ["trailer editor", trailerEdit]]) {
    if (!/import\s+\{\s*ParityDrawer\s*\}/.test(source) || !source.includes("<ParityDrawer")) errors.push(`${label} must use the shared right-side ParityDrawer`);
    if (/import\s+\{\s*Modal\s*\}/.test(source) || source.includes("<Modal")) errors.push(`${label} must not use the centered Modal shell`);
  }
  if (!vehicleProfile.includes('data-testid="vehicle-profile-edit"')) errors.push("vehicle profile must expose a visible header Edit action");
  if (!trailerProfile.includes('data-testid="trailer-profile-edit"')) errors.push("trailer profile must expose a visible header Edit action");
  if (!vehicleProfile.includes('data-testid="vehicle-profile-grid"') || !/xl:grid-cols-2/.test(vehicleProfile)) errors.push("vehicle profile must use the bounded responsive profile grid");
  if (!trailerProfile.includes('data-testid="trailer-profile-grid"') || !/xl:grid-cols-2/.test(trailerProfile)) errors.push("trailer profile must use the bounded responsive profile grid");
  return errors;
}

if (process.argv.includes("--selftest")) {
  const clean = verify();
  if (clean.length) { console.error(`SELFTEST setup failed: ${clean.join("; ")}`); process.exit(1); }
  const planted = read(FILES.vehicleEdit).replace(/ParityDrawer/g, "Modal");
  const errors = verify(new Map([[FILES.vehicleEdit, planted]]));
  if (!errors.some((error) => error.includes("vehicle editor"))) { console.error("SELFTEST FAIL: planted centered vehicle modal was not detected"); process.exit(1); }
  console.log("SELFTEST PASS: 1/1 planted centered-modal regression detected");
  process.exit(0);
}

const errors = verify();
if (errors.length) { console.error("verify-fleet-edit-is-side-drawer: FAIL"); for (const error of errors) console.error(`- ${error}`); process.exit(1); }
console.log("verify-fleet-edit-is-side-drawer: PASS");
