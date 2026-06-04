#!/usr/bin/env node
/**
 * Block B23 CI guard — company parts inventory must read/write maintenance.parts_inventory.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.VERIFY_PARTS_CANONICAL_SOURCE_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const paths = {
  migration: path.join(ROOT, "db/migrations/0357_maint_parts_unify_deprecation.sql"),
  partsRoutes: path.join(ROOT, "apps/backend/src/maintenance/parts.routes.ts"),
  maintenanceHome: path.join(ROOT, "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx"),
  partsMasterData: path.join(ROOT, "apps/frontend/src/pages/maintenance/parts/PartsMasterDataPage.tsx"),
};

function read(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function fail(message) {
  console.error(`verify:parts-canonical-source FAIL: ${message}`);
  process.exit(1);
}

function main() {
  const failures = [];
  const migration = read(paths.migration);
  const partsRoutes = read(paths.partsRoutes);
  const maintenanceHome = read(paths.maintenanceHome);
  const partsMasterData = read(paths.partsMasterData);

  if (!migration) {
    failures.push("missing migration 0357_maint_parts_unify_deprecation.sql");
  } else {
    if (!/catalogs\.parts/.test(migration)) failures.push("migration 0357 must reference catalogs.parts");
    if (!/maint\.part/.test(migration)) failures.push("migration 0357 must reference maint.part");
    if (!/maintenance\.parts_inventory/.test(migration)) failures.push("migration 0357 must reference maintenance.parts_inventory");
    if (!/DEPRECATED.*B23/.test(migration)) failures.push("migration 0357 must mark legacy tables DEPRECATED (B23)");
    if (/DROP TABLE/i.test(migration)) failures.push("migration 0357 must not DROP any table (ARCHIVE-not-DELETE)");
  }

  if (!partsRoutes.includes("FROM maintenance.parts_inventory")) {
    failures.push("parts.routes.ts GET must query maintenance.parts_inventory");
  }
  if (/FROM maint\.part|FROM catalogs\.parts/.test(partsRoutes)) {
    failures.push("parts.routes.ts must not query maint.part or catalogs.parts");
  }
  if (!partsRoutes.includes("INSERT INTO maintenance.parts_inventory")) {
    failures.push("parts.routes.ts POST must insert into maintenance.parts_inventory");
  }

  if (maintenanceHome.includes("listMaintParts")) {
    failures.push("MaintenanceHome must not call listMaintParts (legacy maint.part API)");
  }
  if (!maintenanceHome.includes("listMaintenanceParts")) {
    failures.push("MaintenanceHome dashboard reorder panel must use listMaintenanceParts");
  }
  if (!/Parts Inventory Reorder Flags/.test(maintenanceHome)) {
    failures.push("MaintenanceHome reorder panel label must say Parts Inventory Reorder Flags");
  }

  if (!partsMasterData.includes("listMaintenanceParts")) {
    failures.push("PartsMasterDataPage must use listMaintenanceParts (/maintenance/parts canonical)");
  }

  if (failures.length > 0) {
    for (const item of failures) fail(item);
  }

  console.log("verify:parts-canonical-source PASS");
}

main();
