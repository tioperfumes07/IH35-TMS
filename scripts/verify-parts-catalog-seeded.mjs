#!/usr/bin/env node
/**
 * CLOSURE-10 — maintenance parts catalog gap-close guard.
 * Core catalogs.maintenance_parts shipped via P3-T11.21.5a (#feat/p3-t11.21.5a-maintenance-catalogs);
 * this guard prevents route/UI drift on future edits.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogIndex = path.join(ROOT, "apps/backend/src/catalogs/maintenance/index.ts");
const partsListPage = path.join(ROOT, "apps/frontend/src/pages/lists/maintenance/MaintenancePartsListPage.tsx");
const catalogsApi = path.join(ROOT, "apps/frontend/src/api/catalogs-maintenance.ts");
const migration = path.join(ROOT, "db/migrations/0066_p3_t11_21_5a_maintenance_catalogs.sql");
const manifest = path.join(ROOT, "apps/frontend/src/routes/manifest.tsx");

function fail(message) {
  console.error(`verify:parts-catalog-seeded FAIL: ${message}`);
  process.exit(1);
}

for (const file of [catalogIndex, partsListPage, catalogsApi, migration, manifest]) {
  if (!fs.existsSync(file)) fail(`missing ${path.relative(ROOT, file)}`);
}

const indexSrc = fs.readFileSync(catalogIndex, "utf8");
const partsPage = fs.readFileSync(partsListPage, "utf8");
const apiSrc = fs.readFileSync(catalogsApi, "utf8");
const migrationSrc = fs.readFileSync(migration, "utf8");
const manifestSrc = fs.readFileSync(manifest, "utf8");

if (!indexSrc.includes('tableName: "maintenance_parts"')) {
  fail("catalog index must register maintenance_parts table");
}
if (!indexSrc.includes('urlSegment: "parts"')) {
  fail("catalog index must expose /catalogs/maintenance/parts urlSegment");
}
if (!partsPage.includes("maintenancePartsCatalogClient")) {
  fail("MaintenancePartsListPage must use maintenancePartsCatalogClient");
}
if (!apiSrc.includes('createMaintenanceCatalogClient("parts")')) {
  fail("catalogs-maintenance.ts must define parts catalog client");
}
if (!migrationSrc.includes("'maintenance_parts'")) {
  fail("migration 0066 must create catalogs.maintenance_parts");
}
if (!manifestSrc.includes("/lists/maintenance/parts")) {
  fail("route manifest must include /lists/maintenance/parts");
}

console.log("verify:parts-catalog-seeded PASS");
