#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(path.join(ROOT, "db/migrations/0301_driver_profile_part1.sql"), "utf8");
const cols = ["endorsement_h", "endorsement_n", "endorsement_p", "endorsement_s", "endorsement_t", "endorsement_x"];
for (const col of cols) {
  if (!migration.includes(col)) {
    console.error(`verify:driver-profile-license-endorsements FAIL: missing ${col}`);
    process.exit(1);
  }
}
if (!migration.includes("mdata.drivers")) {
  console.error("verify:driver-profile-license-endorsements FAIL: must alter mdata.drivers");
  process.exit(1);
}
console.log("verify:driver-profile-license-endorsements PASS");
