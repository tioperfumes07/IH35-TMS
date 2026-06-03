#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_PATHS = [
  "db/migrations/0343_drivers_reference_fk_wire.sql",
  "apps/backend/src/mdata/driver-reference-fk.service.ts",
  "apps/backend/src/mdata/driver-aggregate.service.ts",
  "apps/backend/src/__tests__/migrations/0343-drivers-reference-fk-wire.test.ts",
  "apps/backend/src/mdata/__tests__/driver-reference-fk.test.ts",
];

function fail(message) {
  console.error(`verify:drivers-fk-wired FAIL: ${message}`);
  process.exit(1);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing file ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

for (const rel of REQUIRED_PATHS) {
  read(rel);
}

const migration = read("db/migrations/0343_drivers_reference_fk_wire.sql");
const fkService = read("apps/backend/src/mdata/driver-reference-fk.service.ts");
const aggregate = read("apps/backend/src/mdata/driver-aggregate.service.ts");

for (const needle of [
  "license_class_id",
  "driver_employment_status_id",
  "medical_card_status_id",
  "mdata.driver_cdl_endorsements",
  "mdata.driver_cdl_restrictions",
  "sync_driver_reference_fks_row",
]) {
  if (!migration.includes(needle)) fail(`migration missing ${needle}`);
}

for (const needle of [
  "reference.license_classes",
  "reference.employment_statuses",
  "reference.medical_card_statuses",
  "driver_cdl_endorsements",
  "driver_cdl_restrictions",
]) {
  if (!fkService.includes(needle)) fail(`driver-reference-fk.service missing ${needle}`);
}

if (!aggregate.includes("loadDriverReferenceFkEnrichment")) {
  fail("driver-aggregate.service must call loadDriverReferenceFkEnrichment");
}

console.log("verify:drivers-fk-wired PASS");
