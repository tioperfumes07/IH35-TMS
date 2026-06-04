#!/usr/bin/env node
/**
 * Block B33: Parts warranty coverage + claims workflow.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  migration: path.join(ROOT, "db/migrations/0365_maint_warranty.sql"),
  routes: path.join(ROOT, "apps/backend/src/maintenance/warranty.routes.ts"),
  routesTest: path.join(ROOT, "apps/backend/src/maintenance/__tests__/warranty.routes.test.ts"),
  page: path.join(ROOT, "apps/frontend/src/pages/maintenance/WarrantyClaimsPage.tsx"),
  pageTest: path.join(ROOT, "apps/frontend/src/pages/maintenance/__tests__/WarrantyClaimsPage.test.tsx"),
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
  console.error(`verify:maint-warranty-claims FAIL: ${msg}`);
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

  if (!migration.includes("CREATE TABLE IF NOT EXISTS maintenance.parts_warranty")) {
    failures.push("migration must create maintenance.parts_warranty");
  }
  if (!migration.includes("CREATE TABLE IF NOT EXISTS maintenance.warranty_claims")) {
    failures.push("migration must create maintenance.warranty_claims");
  }
  if (!migration.includes("ENABLE ROW LEVEL SECURITY")) {
    failures.push("migration must enable RLS on warranty tables");
  }
  if (!migration.includes("0363 shipped as B32")) {
    failures.push("migration must document 0365 after B32 0363 conflict");
  }

  if (!routes.includes("maintenance.parts_warranty")) failures.push("routes must use maintenance.parts_warranty");
  if (!routes.includes("ARCHIVE-not-DELETE")) failures.push("routes must document ARCHIVE-not-DELETE");
  if (!routes.includes("detectWarrantyEligiblePartsFromWorkOrder")) {
    failures.push("routes must export detectWarrantyEligiblePartsFromWorkOrder");
  }
  if (!routes.includes('app.get("/api/v1/maintenance/warranty/parts"')) {
    failures.push("routes must expose GET warranty/parts");
  }
  if (!routes.includes('app.post("/api/v1/maintenance/warranty/claims"')) {
    failures.push("routes must expose POST warranty/claims");
  }
  if (!routes.includes('app.post("/api/v1/maintenance/warranty/claims/:id/file"')) {
    failures.push("routes must expose file claim endpoint");
  }
  if (!routes.includes('app.post("/api/v1/maintenance/warranty/claims/:id/reimburse"')) {
    failures.push("routes must expose reimburse claim endpoint");
  }
  if (!routes.includes('app.post("/api/v1/maintenance/warranty/detect-from-wo"')) {
    failures.push("routes must expose detect-from-wo endpoint");
  }
  if ((routesTest.match(/\bit\(/g) ?? []).length < 4) {
    failures.push("warranty.routes.test must include at least 4 vitest cases");
  }

  if (!page.includes("maint-warranty-claims-page")) failures.push("WarrantyClaimsPage must expose test id");
  if (!page.includes("+ Create Claim")) failures.push("WarrantyClaimsPage must expose + Create Claim");
  if (!page.includes("File claim")) failures.push("WarrantyClaimsPage must expose File claim action");
  if (!page.includes("warranty-vendor-select")) failures.push("WarrantyClaimsPage must expose vendor select");
  if (!page.includes("warranty-claims-table")) failures.push("WarrantyClaimsPage must expose claims table");
  if (!page.includes("warranty-detect-from-wo")) failures.push("WarrantyClaimsPage must expose detect from WO");
  if ((pageTest.match(/\bit\(/g) ?? []).length < 3) {
    failures.push("WarrantyClaimsPage.test must include at least 3 vitest cases");
  }

  if (!maintenanceApi.includes("listMaintenanceWarrantyClaims")) {
    failures.push("maintenance API must expose listMaintenanceWarrantyClaims");
  }
  if (!maintenanceApi.includes("detectMaintenanceWarrantyFromWorkOrder")) {
    failures.push("maintenance API must expose detectMaintenanceWarrantyFromWorkOrder");
  }
  if (!manifest.includes('path="/maintenance/warranty-claims"')) {
    failures.push("manifest must route /maintenance/warranty-claims");
  }
  if (!index.includes("registerMaintenanceWarrantyRoutes")) {
    failures.push("backend index must register warranty routes");
  }
  if (!index.includes("registerWoTimeEntriesRoutes")) {
    failures.push("backend index must keep registerWoTimeEntriesRoutes");
  }
  if (!archDesign.includes("verify:maint-warranty-claims")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:maint-warranty-claims");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:maint-warranty-claims PASS");
}

main();
