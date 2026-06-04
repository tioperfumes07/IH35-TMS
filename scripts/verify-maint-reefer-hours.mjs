#!/usr/bin/env node
/**
 * Block A19: Reefer hours separate tracking.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  migration: path.join(ROOT, "db/migrations/0366_maint_reefer_hours.sql"),
  routes: path.join(ROOT, "apps/backend/src/maintenance/reefer-hours.routes.ts"),
  routesTest: path.join(ROOT, "apps/backend/src/maintenance/__tests__/reefer-hours.routes.test.ts"),
  section: path.join(ROOT, "apps/frontend/src/components/trailer-profile/TrailerReeferSection.tsx"),
  sectionTest: path.join(ROOT, "apps/frontend/src/components/trailer-profile/__tests__/TrailerReeferSection.test.tsx"),
  maintenanceApi: path.join(ROOT, "apps/frontend/src/api/maintenance.ts"),
  trailerPage: path.join(ROOT, "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx"),
  index: path.join(ROOT, "apps/backend/src/index.ts"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:maint-reefer-hours FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const failures = [];
  const migration = read(paths.migration);
  const routes = read(paths.routes);
  const routesTest = read(paths.routesTest);
  const section = read(paths.section);
  const sectionTest = read(paths.sectionTest);
  const maintenanceApi = read(paths.maintenanceApi);
  const trailerPage = read(paths.trailerPage);
  const index = read(paths.index);
  const archDesign = read(paths.archDesign);

  if (!migration.includes("CREATE TABLE IF NOT EXISTS maintenance.reefer_hours_log")) {
    failures.push("migration must create maintenance.reefer_hours_log");
  }
  if (!migration.includes("CREATE TABLE IF NOT EXISTS maintenance.reefer_specs")) {
    failures.push("migration must create maintenance.reefer_specs");
  }
  if (!migration.includes("0364 reserved for B35")) {
    failures.push("migration must document 0366 slot after 0364 B35 reservation");
  }
  if (!migration.includes("ENABLE ROW LEVEL SECURITY")) {
    failures.push("migration must enable RLS");
  }

  if (!routes.includes("ARCHIVE-not-DELETE")) failures.push("routes must document ARCHIVE-not-DELETE");
  if (!routes.includes("ingestReeferHoursFromSamsaraForCompany")) {
    failures.push("routes must export Samsara ingest helper");
  }
  if (!routes.includes("evaluateReeferHoursPmSchedulesForCompany")) {
    failures.push("routes must evaluate hours-based PM due for B28 integration");
  }
  if (!routes.includes('app.get("/api/v1/maintenance/reefer-hours/snapshot"')) {
    failures.push("routes must expose snapshot endpoint");
  }
  if (!routes.includes('app.post("/api/v1/maintenance/reefer-hours/log"')) {
    failures.push("routes must expose manual log create");
  }
  if (!routes.includes('app.post("/api/v1/maintenance/reefer-hours/ingest-samsara"')) {
    failures.push("routes must expose Samsara ingest endpoint");
  }
  if ((routesTest.match(/\bit\(/g) ?? []).length < 5) {
    failures.push("reefer-hours.routes.test must include at least 5 vitest cases");
  }

  if (section.includes("Coming with A19")) failures.push("TrailerReeferSection stub must be replaced");
  if (!section.includes("Reefer hours tracking")) failures.push("TrailerReeferSection must show live heading");
  if (!section.includes("reefer-hours-history")) failures.push("TrailerReeferSection must show history table");
  if (!section.includes("Record hours")) failures.push("TrailerReeferSection must support manual entry");
  if ((sectionTest.match(/\bit\(/g) ?? []).length < 3) {
    failures.push("TrailerReeferSection.test must include at least 3 vitest cases");
  }

  if (!maintenanceApi.includes("fetchMaintenanceReeferHoursSnapshot")) {
    failures.push("maintenance API must expose fetchMaintenanceReeferHoursSnapshot");
  }
  if (!maintenanceApi.includes("createMaintenanceReeferHoursLogEntry")) {
    failures.push("maintenance API must expose createMaintenanceReeferHoursLogEntry");
  }
  if (!trailerPage.includes("companyId={companyId}")) {
    failures.push("TrailerProfilePage must pass companyId to TrailerReeferSection");
  }
  if (!index.includes("registerMaintenanceReeferHoursRoutes")) {
    failures.push("backend index must register reefer hours routes");
  }
  if (!archDesign.includes("verify:maint-reefer-hours")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:maint-reefer-hours");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:maint-reefer-hours PASS");
}

main();
