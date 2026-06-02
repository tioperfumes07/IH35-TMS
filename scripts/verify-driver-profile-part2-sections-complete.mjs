#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/drivers/DriverProfilePage.tsx"), "utf8");
const required = [
  "dp-section-7-performance",
  "dp-section-8-settlements",
  "dp-section-9-training",
  "dp-section-10-border",
  "dp-section-11-documents",
  "dp-section-12-action-bar",
];
for (const id of required) {
  if (!page.includes(id)) {
    console.error(`verify:driver-profile-part2-sections-complete FAIL: missing ${id}`);
    process.exit(1);
  }
}
console.log("verify:driver-profile-part2-sections-complete PASS");
