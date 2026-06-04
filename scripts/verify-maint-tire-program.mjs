#!/usr/bin/env node
/**
 * Block B32: Tire program tracking — records, rotation, replacement, tread alerts.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  migration: path.join(ROOT, "db/migrations/0363_maint_tire_program.sql"),
  routes: path.join(ROOT, "apps/backend/src/maintenance/tires.routes.ts"),
  routesTest: path.join(ROOT, "apps/backend/src/maintenance/__tests__/tires.routes.test.ts"),
  page: path.join(ROOT, "apps/frontend/src/pages/maintenance/TireProgramPage.tsx"),
  pageTest: path.join(ROOT, "apps/frontend/src/pages/maintenance/__tests__/TireProgramPage.test.tsx"),
  maintenanceApi: path.join(ROOT, "apps/frontend/src/api/maintenance.ts"),
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  index: path.join(ROOT, "apps/backend/src/index.ts"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:maint-tire-program FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const failures = [];
  const migration = read(paths.migration);
  const routes = read(paths.routes);
  const routesTest = read(paths.routesTest);
  const page = read(paths.page);
  const pageTest = read(paths.pageTest);
  const maintenanceApi = read(paths.maintenanceApi);
  const manifest = read(paths.manifest);
  const index = read(paths.index);
  const archDesign = read(paths.archDesign);

  if (!migration.includes("CREATE TABLE IF NOT EXISTS maintenance.tire_brands")) {
    failures.push("migration must create maintenance.tire_brands");
  }
  if (!migration.includes("CREATE TABLE IF NOT EXISTS maintenance.tire_records")) {
    failures.push("migration must create maintenance.tire_records");
  }
  if (!migration.includes("CREATE TABLE IF NOT EXISTS maintenance.tire_events")) {
    failures.push("migration must create maintenance.tire_events");
  }
  if (!migration.includes("0362 shipped as B30")) {
    failures.push("migration must document 0363 after B30 0362 conflict");
  }

  if (!routes.includes("maintenance.tire_records")) failures.push("routes must use maintenance.tire_records");
  if (!routes.includes("ARCHIVE-not-DELETE")) failures.push("routes must document ARCHIVE-not-DELETE");
  if (!routes.includes('app.post("/api/v1/maintenance/tires/rotate"')) {
    failures.push("routes must expose rotate endpoint");
  }
  if (!routes.includes('app.post("/api/v1/maintenance/tires/replace"')) {
    failures.push("routes must expose replace endpoint");
  }
  if (!routes.includes('app.post("/api/v1/maintenance/tires/tread-audit"')) {
    failures.push("routes must expose tread-audit endpoint");
  }
  if (!routes.includes('app.get("/api/v1/maintenance/tires/alerts"')) {
    failures.push("routes must expose tread alerts endpoint");
  }
  if ((routesTest.match(/\bit\(/g) ?? []).length < 5) {
    failures.push("tires.routes.test must include at least 5 vitest cases");
  }

  if (!page.includes("maint-tire-program-page")) failures.push("TireProgramPage must expose test id");
  if (!page.includes("+ Create Tire Record")) failures.push("TireProgramPage must expose + Create Tire Record");
  if (!page.includes("Rotate")) failures.push("TireProgramPage must expose rotation quick action");
  if (!page.includes("Tread audit")) failures.push("TireProgramPage must expose tread audit action");
  if (!page.includes("tire-program-history")) failures.push("TireProgramPage must expose history table");
  if ((pageTest.match(/\bit\(/g) ?? []).length < 3) {
    failures.push("TireProgramPage.test must include at least 3 vitest cases");
  }

  if (!maintenanceApi.includes("getMaintenanceTireLayout")) {
    failures.push("maintenance API must expose getMaintenanceTireLayout");
  }
  if (!maintenanceApi.includes("auditMaintenanceTireTread")) {
    failures.push("maintenance API must expose auditMaintenanceTireTread");
  }
  if (!manifest.includes('path="/maintenance/tires"')) {
    failures.push("manifest must route /maintenance/tires");
  }
  if (!index.includes("registerMaintenanceTiresRoutes")) {
    failures.push("backend index must register tire routes");
  }
  if (!archDesign.includes("verify:maint-tire-program")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:maint-tire-program");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:maint-tire-program PASS");
}

main();
