#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(path.join(ROOT, "db/migrations/0295_vehicle_profile_part1.sql"), "utf8");
const routes = fs.readFileSync(path.join(ROOT, "apps/backend/src/mdata/unit-plates.routes.ts"), "utf8");
if (!migration.includes("mdata.unit_plates")) {
  console.error("verify:vehicle-profile-plates-multi-jurisdiction FAIL: missing unit_plates table");
  process.exit(1);
}
if (!routes.includes("US_JURISDICTIONS") || !routes.includes("MX_JURISDICTIONS")) {
  console.error("verify:vehicle-profile-plates-multi-jurisdiction FAIL: missing jurisdiction lists");
  process.exit(1);
}
if (!routes.includes("validatePlateJurisdiction")) {
  console.error("verify:vehicle-profile-plates-multi-jurisdiction FAIL: missing validatePlateJurisdiction");
  process.exit(1);
}
if (routes.includes("Federal") === false || routes.includes("Nuevo León") === false) {
  console.error("verify:vehicle-profile-plates-multi-jurisdiction FAIL: missing MX Federal/state coverage");
  process.exit(1);
}
console.log("verify:vehicle-profile-plates-multi-jurisdiction PASS");
