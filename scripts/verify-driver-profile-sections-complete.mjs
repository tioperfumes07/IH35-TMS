#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/drivers/DriverProfilePage.tsx"), "utf8");
const required = [
  "dp-section-1-identity",
  "dp-section-2-license",
  "dp-section-3-medical",
  "dp-section-4-drug",
  "dp-section-5-hos",
  "dp-section-6-assignment",
];
for (const id of required) {
  if (!page.includes(id)) {
    console.error(`verify:driver-profile-sections-complete FAIL: missing ${id}`);
    process.exit(1);
  }
}
console.log("verify:driver-profile-sections-complete PASS");
