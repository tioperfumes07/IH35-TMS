#!/usr/bin/env node
/**
 * Block B29: Vendor master unify — catalogs.maintenance_vendors CRUD, CSV import, detail page.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  routes: path.join(ROOT, "apps/backend/src/maintenance/vendors.routes.ts"),
  routesTest: path.join(ROOT, "apps/backend/src/maintenance/__tests__/vendors.routes.test.ts"),
  vendorsPage: path.join(ROOT, "apps/frontend/src/pages/maintenance/vendors/VendorsPage.tsx"),
  vendorDetailPage: path.join(ROOT, "apps/frontend/src/pages/maintenance/VendorDetailPage.tsx"),
  vendorsPageTest: path.join(ROOT, "apps/frontend/src/pages/maintenance/__tests__/VendorsPage.test.tsx"),
  vendorDetailTest: path.join(ROOT, "apps/frontend/src/pages/maintenance/__tests__/VendorDetailPage.test.tsx"),
  listsPage: path.join(ROOT, "apps/frontend/src/pages/lists/maintenance/MaintenanceVendorsListPage.tsx"),
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  maintenanceApi: path.join(ROOT, "apps/frontend/src/api/maintenance.ts"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:maint-vendor-master-unify FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const failures = [];
  const routes = read(paths.routes);
  const routesTest = read(paths.routesTest);
  const vendorsPage = read(paths.vendorsPage);
  const vendorDetailPage = read(paths.vendorDetailPage);
  const vendorsPageTest = read(paths.vendorsPageTest);
  const vendorDetailTest = read(paths.vendorDetailTest);
  const listsPage = read(paths.listsPage);
  const manifest = read(paths.manifest);
  const maintenanceApi = read(paths.maintenanceApi);
  const archDesign = read(paths.archDesign);

  if (!routes.includes("catalogs.maintenance_vendors")) failures.push("vendors.routes must use catalogs.maintenance_vendors");
  if (routes.includes("mdata.qbo_vendors")) failures.push("vendors.routes must not read mdata.qbo_vendors (B29 unify)");
  if (!routes.includes('/api/v1/maintenance/vendors/import')) failures.push("vendors.routes must expose CSV import endpoint");
  if (!routes.includes('/api/v1/maintenance/vendors/:id/archive')) failures.push("vendors.routes must expose archive endpoint");
  if (!routes.includes("ARCHIVE-not-DELETE")) failures.push("vendors.routes must document ARCHIVE-not-DELETE");

  if ((routesTest.match(/\bit\(/g) ?? []).length < 4) {
    failures.push("vendors.routes.test must include at least 4 vitest cases");
  }

  if (!vendorsPage.includes("maint-vendors-page")) failures.push("VendorsPage must expose test id");
  if (!vendorsPage.includes("+ Create Vendor")) failures.push("VendorsPage must expose + Create Vendor");
  if (!vendorsPage.includes("CSV Import")) failures.push("VendorsPage must wire CSV Import");
  if ((vendorsPageTest.match(/\bit\(/g) ?? []).length < 3) {
    failures.push("VendorsPage.test must include at least 3 vitest cases");
  }

  if (!vendorDetailPage.includes("maint-vendor-detail-page")) failures.push("VendorDetailPage must expose test id");
  if (!vendorDetailPage.includes("Work Order History")) failures.push("VendorDetailPage must show WO history");
  if (!vendorDetailPage.includes("Invoice History")) failures.push("VendorDetailPage must show invoice history");
  if ((vendorDetailTest.match(/\bit\(/g) ?? []).length < 3) {
    failures.push("VendorDetailPage.test must include at least 3 vitest cases");
  }

  if (!listsPage.includes("/maintenance/vendors")) failures.push("MaintenanceVendorsListPage must link to maintenance vendors hub");
  if (!manifest.includes('path="/maintenance/vendors/:vendorId"')) failures.push("manifest must register vendor detail route");
  if (!maintenanceApi.includes("getMaintenanceVendorDetail")) failures.push("maintenance API must expose getMaintenanceVendorDetail");
  if (!maintenanceApi.includes("importMaintenanceVendors")) failures.push("maintenance API must expose importMaintenanceVendors");

  if (!archDesign.includes("verify:maint-vendor-master-unify")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:maint-vendor-master-unify");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:maint-vendor-master-unify PASS");
}

main();
