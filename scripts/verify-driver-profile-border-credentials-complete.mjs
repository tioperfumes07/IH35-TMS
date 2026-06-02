#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(path.join(ROOT, "db/migrations/0302_driver_profile_part2.sql"), "utf8");
const cols = [
  "fast_card_number",
  "fast_card_expiration",
  "sentri_member",
  "sentri_expiration",
  "twic_card_number",
  "twic_expiration",
  "passport_country",
  "mexican_license_number",
  "mexican_license_expiration",
  "visa_b1_status",
];
for (const col of cols) {
  if (!migration.includes(col)) {
    console.error(`verify:driver-profile-border-credentials-complete FAIL: missing ${col}`);
    process.exit(1);
  }
}
if (!migration.includes("mdata.drivers")) {
  console.error("verify:driver-profile-border-credentials-complete FAIL: must alter mdata.drivers");
  process.exit(1);
}
console.log("verify:driver-profile-border-credentials-complete PASS");
