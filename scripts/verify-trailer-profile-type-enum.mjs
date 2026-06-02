#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(path.join(ROOT, "db/migrations/0303_trailer_profile_part1.sql"), "utf8");
const routes = fs.readFileSync(path.join(ROOT, "apps/backend/src/mdata/equipment.routes.ts"), "utf8");
if (!migration.includes("Conestoga") || !migration.includes("'RGN'") || !migration.includes("'Other'")) {
  console.error("verify:trailer-profile-type-enum FAIL: migration missing extended types");
  process.exit(1);
}
if (!routes.includes("Conestoga") || !routes.includes("RGN") || !routes.includes("Other")) {
  console.error("verify:trailer-profile-type-enum FAIL: routes schema missing extended types");
  process.exit(1);
}
console.log("verify:trailer-profile-type-enum PASS");
