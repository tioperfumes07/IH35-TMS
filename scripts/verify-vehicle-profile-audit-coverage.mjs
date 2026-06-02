#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const units = fs.readFileSync(path.join(ROOT, "apps/backend/src/mdata/units.routes.ts"), "utf8");
const keys = [
  "status_change_reason",
  "sold_date",
  "transferred_to_entity",
  "damage_description",
  "oos_reason",
  "quick_availability",
  "UNIT_PROFILE_AUDIT_FIELD_KEYS",
  "mdata.unit.status_changed",
  "profile_fields",
];
for (const key of keys) {
  if (!units.includes(key)) {
    console.error(`verify:vehicle-profile-audit-coverage FAIL: units.routes.ts missing ${key}`);
    process.exit(1);
  }
}
if (units.includes("log_unit_status_change")) {
  console.error("verify:vehicle-profile-audit-coverage FAIL: DB trigger must not be used");
  process.exit(1);
}
console.log("verify:vehicle-profile-audit-coverage PASS");
