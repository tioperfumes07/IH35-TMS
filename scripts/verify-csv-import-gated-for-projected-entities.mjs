#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_CSV_IMPORT_GATED_ROOT ?? process.cwd();

const projectedEntityRouteChecks = [
  {
    id: "vehicles",
    file: process.env.VERIFY_CSV_IMPORT_GATED_VEHICLES_PATH ?? "apps/backend/src/maintenance/vehicles.routes.ts",
    required: ["VEHICLES_CSV_IMPORT_ENABLED", "isVehiclesCsvImportEnabled", "vehicles_csv_import_disabled"],
  },
  {
    id: "drivers",
    file: process.env.VERIFY_CSV_IMPORT_GATED_DRIVERS_PATH ?? "apps/backend/src/maintenance/drivers.routes.ts",
    required: ["DRIVERS_CSV_IMPORT_ENABLED", "isDriversCsvImportEnabled", "drivers_csv_import_disabled"],
  },
];

const exemptEntityChecks = [
  {
    id: "parts",
    file: process.env.VERIFY_CSV_IMPORT_GATED_PARTS_PATH ?? "apps/backend/src/maintenance/parts.routes.ts",
    required: ["app.post(\"/api/v1/maintenance/parts/import\""],
    forbidden: ["PARTS_CSV_IMPORT_ENABLED"],
  },
];

function readSource(relativePath) {
  const abs = path.join(ROOT, relativePath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
}

const failures = [];

for (const check of projectedEntityRouteChecks) {
  const source = readSource(check.file);
  if (!source) {
    failures.push(`missing_file:${check.id}:${check.file}`);
    continue;
  }
  for (const required of check.required) {
    if (!source.includes(required)) {
      failures.push(`ungated_csv_import:${check.id}:${required}`);
    }
  }
}

for (const check of exemptEntityChecks) {
  const source = readSource(check.file);
  if (!source) {
    failures.push(`missing_file:${check.id}:${check.file}`);
    continue;
  }
  for (const required of check.required) {
    if (!source.includes(required)) {
      failures.push(`missing_parts_import:${required}`);
    }
  }
  for (const forbidden of check.forbidden ?? []) {
    if (source.includes(forbidden)) {
      failures.push(`parts_should_not_be_env_gated:${forbidden}`);
    }
  }
}

if (failures.length > 0) {
  console.error("verify:csv-import-gated-for-projected-entities FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("verify:csv-import-gated-for-projected-entities OK");
