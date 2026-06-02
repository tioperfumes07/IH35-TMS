#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const unitRoutes = fs.readFileSync(path.join(ROOT, "apps/backend/src/mdata/unit-default-driver.routes.ts"), "utf8");
const driverRoutes = fs.readFileSync(path.join(ROOT, "apps/backend/src/mdata/driver-default-truck.routes.ts"), "utf8");
const aggregate = fs.readFileSync(path.join(ROOT, "apps/backend/src/mdata/driver-aggregate.service.ts"), "utf8");

for (const endpoint of ["/default-truck", "/clear-default-truck", "truck-assignments"]) {
  if (!driverRoutes.includes(endpoint)) {
    console.error(`verify:driver-profile-default-truck-symmetry FAIL: missing ${endpoint}`);
    process.exit(1);
  }
}
for (const endpoint of ["/drivers/default", "/drivers/clear-default", "/drivers/assignments"]) {
  if (!unitRoutes.includes(endpoint)) {
    console.error(`verify:driver-profile-default-truck-symmetry FAIL: unit mirror missing ${endpoint}`);
    process.exit(1);
  }
}
if (!aggregate.includes("is_default") || !aggregate.includes("samsara_webhook")) {
  console.error("verify:driver-profile-default-truck-symmetry FAIL: aggregate must read default + samsara assignments");
  process.exit(1);
}
if (!driverRoutes.includes("is_default = true") || !unitRoutes.includes("is_default = true")) {
  console.error("verify:driver-profile-default-truck-symmetry FAIL: both routes must set is_default");
  process.exit(1);
}
console.log("verify:driver-profile-default-truck-symmetry PASS");
