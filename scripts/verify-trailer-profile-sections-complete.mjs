#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx"), "utf8");
for (const id of [
  "tp-section-1-identity",
  "tp-section-2-specs",
  "tp-section-3-assignment",
  "tp-section-5-maintenance",
  "tp-section-6-compliance",
  "tp-section-7-documents",
  "tp-section-8-action-bar",
]) {
  if (!page.includes(id)) {
    console.error(`verify:trailer-profile-sections-complete FAIL: missing ${id}`);
    process.exit(1);
  }
}
console.log("verify:trailer-profile-sections-complete PASS");
