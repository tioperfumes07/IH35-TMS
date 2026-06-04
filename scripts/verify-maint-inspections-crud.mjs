#!/usr/bin/env node
/**
 * Block B30: Inspections CRUD + DVIR linkage + docs photo upload.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  migration: path.join(ROOT, "db/migrations/0362_maint_inspections.sql"),
  routes: path.join(ROOT, "apps/backend/src/maintenance/inspections.routes.ts"),
  routesTest: path.join(ROOT, "apps/backend/src/maintenance/__tests__/inspections.routes.test.ts"),
  page: path.join(ROOT, "apps/frontend/src/pages/maintenance/inspections/InspectionsPage.tsx"),
  pageTest: path.join(ROOT, "apps/frontend/src/pages/maintenance/__tests__/InspectionsPage.test.tsx"),
  maintenanceApi: path.join(ROOT, "apps/frontend/src/api/maintenance.ts"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:maint-inspections-crud FAIL: ${msg}`);
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
  const archDesign = read(paths.archDesign);

  if (!migration.includes("CREATE TABLE IF NOT EXISTS maintenance.inspections")) {
    failures.push("migration must create maintenance.inspections");
  }
  if (!migration.includes("CREATE TABLE IF NOT EXISTS maintenance.inspection_photos")) {
    failures.push("migration must create maintenance.inspection_photos");
  }
  if (!migration.includes("dvir_submission_id")) failures.push("migration must include dvir_submission_id FK");

  if (!routes.includes("maintenance.inspections")) failures.push("routes must use maintenance.inspections");
  if (routes.includes("maintenance.dot_inspection_events")) {
    failures.push("routes must not query legacy maintenance.dot_inspection_events");
  }
  if (!routes.includes("ARCHIVE-not-DELETE")) failures.push("routes must document ARCHIVE-not-DELETE");
  if (!routes.includes('app.patch("/api/v1/maintenance/inspections/:id"')) {
    failures.push("routes must expose PATCH update endpoint");
  }
  if (!routes.includes('app.post("/api/v1/maintenance/inspections/:id/archive"')) {
    failures.push("routes must expose archive endpoint");
  }
  if (!routes.includes('app.post("/api/v1/maintenance/inspections/:id/photos"')) {
    failures.push("routes must expose photo attach endpoint");
  }
  if (!routes.includes("safety.dvir_submissions")) failures.push("routes must link safety.dvir_submissions");
  if (!routes.includes("docs.files")) failures.push("routes must validate docs.files for photos");
  if ((routesTest.match(/\bit\(/g) ?? []).length < 4) {
    failures.push("inspections.routes.test must include at least 4 vitest cases");
  }

  if (!page.includes("maint-inspections-page")) failures.push("InspectionsPage must expose test id");
  if (!page.includes("+ Create Inspection")) failures.push("InspectionsPage must expose + Create Inspection");
  if (!page.includes("requestUploadUrl")) failures.push("InspectionsPage must upload photos via docs module");
  if (!page.includes("getSafetyDvirSubmissions")) failures.push("InspectionsPage must wire DVIR linkage");
  if ((pageTest.match(/\bit\(/g) ?? []).length < 3) {
    failures.push("InspectionsPage.test must include at least 3 vitest cases");
  }

  if (!maintenanceApi.includes("attachMaintenanceInspectionPhoto")) {
    failures.push("maintenance API must expose attachMaintenanceInspectionPhoto");
  }
  if (!maintenanceApi.includes("archiveMaintenanceInspection")) {
    failures.push("maintenance API must expose archiveMaintenanceInspection");
  }

  if (!archDesign.includes("verify:maint-inspections-crud")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:maint-inspections-crud");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:maint-inspections-crud PASS");
}

main();
