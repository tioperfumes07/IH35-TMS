#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(path.join(ROOT, "db/migrations/0295_vehicle_profile_part1.sql"), "utf8");
const routes = fs.readFileSync(path.join(ROOT, "apps/backend/src/mdata/unit-default-driver.routes.ts"), "utf8");
const aggregate = fs.readFileSync(path.join(ROOT, "apps/backend/src/mdata/unit-aggregate.service.ts"), "utf8");
const driverSection = fs.readFileSync(path.join(ROOT, "apps/frontend/src/components/vehicle-profile/DriverAssignmentSection.tsx"), "utf8");

if (!migration.includes("is_default") || !migration.includes("telematics.vehicle_driver_assignments")) {
  console.error("verify:vehicle-profile-driver-dual-tracking FAIL: missing is_default on telematics.vehicle_driver_assignments");
  process.exit(1);
}
if (!migration.includes("uq_vda_one_default_per_unit")) {
  console.error("verify:vehicle-profile-driver-dual-tracking FAIL: missing default unique index");
  process.exit(1);
}
for (const endpoint of ["/drivers/assignments", "/drivers/default", "/drivers/clear-default", "/current-driver"]) {
  if (!routes.includes(endpoint)) {
    console.error(`verify:vehicle-profile-driver-dual-tracking FAIL: missing endpoint ${endpoint}`);
    process.exit(1);
  }
}
if (!aggregate.includes("default_driver") || !aggregate.includes("current_driver") || !aggregate.includes("samsara_webhook")) {
  console.error("verify:vehicle-profile-driver-dual-tracking FAIL: aggregate must read default + current from telematics");
  process.exit(1);
}
if (!driverSection.includes("defaultDriver") || !driverSection.includes("currentDriver")) {
  console.error("verify:vehicle-profile-driver-dual-tracking FAIL: frontend must render default + current separately");
  process.exit(1);
}
console.log("verify:vehicle-profile-driver-dual-tracking PASS");
