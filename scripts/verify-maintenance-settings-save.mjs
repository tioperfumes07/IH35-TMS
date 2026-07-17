#!/usr/bin/env node
/**
 * Block 0441-mod2-settings-view-only: Maintenance Settings Save must call PATCH /api/v1/maintenance/settings (not local-only setState).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  page: path.join(ROOT, "apps/frontend/src/pages/maintenance/MaintenanceSettingsPage.tsx"),
  pageTest: path.join(ROOT, "apps/frontend/src/pages/maintenance/__tests__/MaintenanceSettingsPage.test.tsx"),
  maintenanceApi: path.join(ROOT, "apps/frontend/src/api/maintenance.ts"),
  settingsRoutes: path.join(ROOT, "apps/backend/src/maintenance/settings.routes.ts"),
  settingsRoutesTest: path.join(ROOT, "apps/backend/src/maintenance/__tests__/settings.routes.test.ts"),
  index: path.join(ROOT, "apps/backend/src/index.ts"),
  migration: path.join(ROOT, "db/migrations/202607580000_maintenance_settings.sql"),
  packageJson: path.join(ROOT, "package.json"),
  lockedGuards: path.join(ROOT, ".github/workflows/locked-guards.yml"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:maintenance-settings-save FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const page = read(paths.page);
  const pageTest = read(paths.pageTest);
  const maintenanceApi = read(paths.maintenanceApi);
  const settingsRoutes = read(paths.settingsRoutes);
  const settingsRoutesTest = read(paths.settingsRoutesTest);
  const index = read(paths.index);
  const migration = read(paths.migration);
  const packageJson = read(paths.packageJson);
  const lockedGuards = read(paths.lockedGuards);
  const failures = [];

  if (!page.includes("updateMaintenanceSettings")) failures.push("MaintenanceSettingsPage must save via updateMaintenanceSettings");
  if (!page.includes("useMutation")) failures.push("MaintenanceSettingsPage must use mutation for Save");
  if (page.includes('data-testid="maintenance-settings-pm-interval"') && page.includes("readOnly")) {
    const pmInput = page.split('data-testid="maintenance-settings-pm-interval"')[1]?.split("/>")[0] ?? "";
    if (pmInput.includes("readOnly")) failures.push("PM interval input must be editable");
  }
  if (!page.includes('data-testid="maintenance-settings-save"')) failures.push("MaintenanceSettingsPage must expose save test id");

  if (!maintenanceApi.includes("getMaintenanceSettings")) failures.push("maintenance API must export getMaintenanceSettings");
  if (!maintenanceApi.includes("updateMaintenanceSettings")) failures.push("maintenance API must export updateMaintenanceSettings");
  if (!maintenanceApi.includes('method: "PATCH"')) failures.push("updateMaintenanceSettings must PATCH");

  if (!settingsRoutes.includes('app.get("/api/v1/maintenance/settings"')) failures.push("backend must expose GET maintenance settings");
  if (!settingsRoutes.includes('app.patch("/api/v1/maintenance/settings"')) failures.push("backend must expose PATCH maintenance settings");
  if (!settingsRoutes.includes("appendCrudAudit")) failures.push("PATCH must append audit event");
  if (!index.includes("registerMaintenanceSettingsRoutes")) failures.push("index must register maintenance settings routes");

  if (!migration.includes("maintenance.maintenance_settings")) failures.push("migration must create maintenance.maintenance_settings");
  if (!migration.includes("ENABLE ROW LEVEL SECURITY")) failures.push("migration must enable RLS");

  if (!pageTest.includes("updateMaintenanceSettings")) failures.push("frontend test must assert PATCH save");
  if (!settingsRoutesTest.includes('PATCH /api/v1/maintenance/settings saves instead of 404')) {
    failures.push("backend test must assert PATCH save");
  }

  if (!packageJson.includes('"verify:maintenance-settings-save"')) {
    failures.push("package.json must wire verify:maintenance-settings-save");
  }
  if (!lockedGuards.includes("verify:maintenance-settings-save")) {
    failures.push("locked-guards.yml must run verify:maintenance-settings-save");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:maintenance-settings-save PASS");
}

main();
