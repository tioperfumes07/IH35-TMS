#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx"), "utf8");
const required = [
  "vp-section-7-reefer",
  "vp-section-8-financial",
  "vp-section-9-activity",
  "vp-section-10-documents",
  "vp-section-11-action-bar",
];
for (const id of required) {
  if (!page.includes(id)) {
    console.error(`verify:vehicle-profile-part2-sections-complete FAIL: missing ${id}`);
    process.exit(1);
  }
}
console.log("verify:vehicle-profile-part2-sections-complete PASS");
