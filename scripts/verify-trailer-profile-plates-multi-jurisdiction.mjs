#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(path.join(ROOT, "db/migrations/0303_trailer_profile_part1.sql"), "utf8");
const routes = fs.readFileSync(path.join(ROOT, "apps/backend/src/mdata/equipment-plates.routes.ts"), "utf8");
if (!migration.includes("equipment_plates")) {
  console.error("verify:trailer-profile-plates-multi-jurisdiction FAIL: missing equipment_plates table");
  process.exit(1);
}
if (!migration.includes("country IN ('US','MX')") && !migration.includes("country IN ('US', 'MX')")) {
  console.error("verify:trailer-profile-plates-multi-jurisdiction FAIL: US/MX country check missing");
  process.exit(1);
}
if (!routes.includes("validatePlateJurisdiction")) {
  console.error("verify:trailer-profile-plates-multi-jurisdiction FAIL: jurisdiction validation missing");
  process.exit(1);
}
console.log("verify:trailer-profile-plates-multi-jurisdiction PASS");
