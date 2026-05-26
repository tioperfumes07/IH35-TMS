#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_MASTER_DATA_WRITE_ROUTES_ROOT ?? process.cwd();
const TARGETS = [
  {
    id: "vehicles",
    file: process.env.VERIFY_MASTER_DATA_WRITE_ROUTES_VEHICLES_PATH ?? "apps/backend/src/maintenance/vehicles.routes.ts",
    mustContain: [
      "app.post(\"/api/v1/maintenance/vehicles\"",
      "app.patch(\"/api/v1/maintenance/vehicles/:id\"",
      "app.patch(\"/api/v1/maintenance/vehicles/:id/void\"",
      "appendCrudAudit",
      "samsara_vehicle_id",
      "INSERT INTO outbox.events",
    ],
    forbidden: ["app.delete(\"/api/v1/maintenance/vehicles"],
  },
  {
    id: "drivers",
    file: process.env.VERIFY_MASTER_DATA_WRITE_ROUTES_DRIVERS_PATH ?? "apps/backend/src/maintenance/drivers.routes.ts",
    mustContain: [
      "app.post(\"/api/v1/maintenance/drivers\"",
      "app.patch(\"/api/v1/maintenance/drivers/:id\"",
      "app.patch(\"/api/v1/maintenance/drivers/:id/void\"",
      "appendCrudAudit",
      "samsara_driver_id",
      "INSERT INTO outbox.events",
    ],
    forbidden: ["app.delete(\"/api/v1/maintenance/drivers"],
  },
  {
    id: "parts",
    file: process.env.VERIFY_MASTER_DATA_WRITE_ROUTES_PARTS_PATH ?? "apps/backend/src/maintenance/parts.routes.ts",
    mustContain: [
      "app.post(\"/api/v1/maintenance/parts\"",
      "app.patch(\"/api/v1/maintenance/parts/:id\"",
      "app.patch(\"/api/v1/maintenance/parts/:id/void\"",
      "appendCrudAudit",
    ],
    forbidden: ["app.delete(\"/api/v1/maintenance/parts"],
  },
];

function readSource(filePath) {
  const abs = path.join(ROOT, filePath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
}

const failures = [];

for (const target of TARGETS) {
  const source = readSource(target.file);
  if (!source) {
    failures.push(`missing_file:${target.id}:${target.file}`);
    continue;
  }
  for (const expected of target.mustContain) {
    if (!source.includes(expected)) {
      failures.push(`missing_pattern:${target.id}:${expected}`);
    }
  }
  for (const denied of target.forbidden) {
    if (source.includes(denied)) {
      failures.push(`forbidden_pattern:${target.id}:${denied}`);
    }
  }
}

if (failures.length > 0) {
  console.error("verify:master-data-write-routes FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("verify:master-data-write-routes OK");
