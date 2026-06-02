#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const aggregate = fs.readFileSync(path.join(ROOT, "apps/backend/src/mdata/driver-aggregate.service.ts"), "utf8");
const hosSection = fs.readFileSync(path.join(ROOT, "apps/frontend/src/components/driver-profile/HOSStatusSection.tsx"), "utf8");
const page = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/drivers/DriverProfilePage.tsx"), "utf8");

if (!aggregate.includes("getCurrentClocks") || !aggregate.includes("hos.duty_status_events")) {
  console.error("verify:driver-profile-hos-source FAIL: aggregate must use getCurrentClocks + hos.duty_status_events");
  process.exit(1);
}
if (hosSection.includes("drive_remaining_min: 660") || hosSection.includes("hardcoded")) {
  console.error("verify:driver-profile-hos-source FAIL: HOS section must not hardcode clock values");
  process.exit(1);
}
if (!page.includes("refetchInterval: 30_000") || !page.includes("HOSStatusSection")) {
  console.error("verify:driver-profile-hos-source FAIL: page must refetch HOS and render HOSStatusSection");
  process.exit(1);
}
console.log("verify:driver-profile-hos-source PASS");
