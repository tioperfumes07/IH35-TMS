#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const units = fs.readFileSync(path.join(ROOT, "apps/backend/src/mdata/units.routes.ts"), "utf8");
const bulkUnits = fs.readFileSync(path.join(ROOT, "apps/backend/src/mdata/unit-bulk-update.routes.ts"), "utf8");
const maintenanceVehicles = fs.readFileSync(path.join(ROOT, "apps/backend/src/maintenance/vehicles.routes.ts"), "utf8");
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
const failures = [];
if (units.includes("log_unit_status_change")) failures.push("DB trigger must not be used");
if (!/const normalizedPatch\s*=\s*[\s\S]{0,180}is_oos:\s*b\.status === "OutOfService"/.test(units)) {
  failures.push("single-unit status PATCH must derive is_oos from canonical status");
}
if (!/applyUnitPatchFields\(normalizedPatch, add\)/.test(units)) {
  failures.push("single-unit writer must persist the normalized status/is_oos patch");
}
if (!/add\("is_oos", dbStatus === "OutOfService"\)/.test(bulkUnits)) {
  failures.push("bulk status writer must set and clear is_oos from canonical status");
}
if (!/if \("status" in body\.data\) \{[\s\S]{0,420}add\("status", body\.data\.status\);[\s\S]{0,420}add\("is_oos", body\.data\.status === "OutOfService"\);[\s\S]{0,80}\}/.test(maintenanceVehicles)) {
  failures.push("maintenance vehicle status writer must set and clear is_oos from canonical status");
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [units.replace('is_oos: b.status === "OutOfService"', "is_oos: false"), bulkUnits, maintenanceVehicles, "single writer hard-codes false"],
    [units.replace("applyUnitPatchFields(normalizedPatch, add)", "applyUnitPatchFields(b, add)"), bulkUnits, maintenanceVehicles, "single writer drops normalization"],
    [units, bulkUnits.replace('add("is_oos", dbStatus === "OutOfService")', 'add("is_oos", true)'), maintenanceVehicles, "bulk writer never clears OOS"],
    [units, bulkUnits, maintenanceVehicles.replace('add("is_oos", body.data.status === "OutOfService")', 'add("is_oos", true)'), "maintenance writer never clears OOS"],
  ];
  const catches = mutations.filter(([single, bulk, maintenance]) =>
    !/const normalizedPatch\s*=\s*[\s\S]{0,180}is_oos:\s*b\.status === "OutOfService"/.test(single) ||
    !/applyUnitPatchFields\(normalizedPatch, add\)/.test(single) ||
    !/add\("is_oos", dbStatus === "OutOfService"\)/.test(bulk) ||
    !/if \("status" in body\.data\) \{[\s\S]{0,420}add\("status", body\.data\.status\);[\s\S]{0,420}add\("is_oos", body\.data\.status === "OutOfService"\);[\s\S]{0,80}\}/.test(maintenance)
  ).length;
  if (catches !== mutations.length) failures.push(`selftest caught ${catches}/${mutations.length} planted defects`);
  else console.log(`verify:vehicle-profile-audit-coverage selftest PASS (${catches}/${mutations.length} mutations)`);
}

if (failures.length) {
  for (const failure of failures) console.error(`verify:vehicle-profile-audit-coverage FAIL: ${failure}`);
  process.exit(1);
}
console.log("verify:vehicle-profile-audit-coverage PASS");
