#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx"), "utf8");
const required = [
  "vp-section-1-identity",
  "vp-section-2-telemetry",
  "vp-section-3-driver",
  "vp-section-4-load",
  "vp-section-5-maintenance",
  "vp-section-6-compliance",
];
for (const id of required) {
  if (!page.includes(id)) {
    console.error(`verify:vehicle-profile-sections-complete FAIL: missing ${id}`);
    process.exit(1);
  }
}
console.log("verify:vehicle-profile-sections-complete PASS");
