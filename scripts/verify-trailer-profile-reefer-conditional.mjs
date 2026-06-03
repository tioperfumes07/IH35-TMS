#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx"), "utf8");
const section = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/components/trailer-profile/ReeferTelemetrySection.tsx"),
  "utf8"
);
if (!page.includes('"Reefer"')) {
  console.error("verify:trailer-profile-reefer-conditional FAIL: page must gate reefer section on type");
  process.exit(1);
}
if (!section.includes("if (!reefer) return null")) {
  console.error("verify:trailer-profile-reefer-conditional FAIL: ReeferTelemetrySection must return null without reefer");
  process.exit(1);
}
if (!page.includes("TrailerReeferSection")) {
  console.error("verify:trailer-profile-reefer-conditional FAIL: A19 reefer slot component missing");
  process.exit(1);
}
console.log("verify:trailer-profile-reefer-conditional PASS");
