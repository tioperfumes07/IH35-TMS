#!/usr/bin/env node
/**
 * Block B24: Maintenance module nav + count integrity (canonical surfaces).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_MAINT_NAV_COUNT_RECONCILE_ROOT ?? process.cwd();

const paths = {
  navConfig: path.join(ROOT, "apps/frontend/src/components/maintenance/MAINTENANCE_NAV_CONFIG.ts"),
  homePage: path.join(ROOT, "apps/frontend/src/pages/home/roles/DefaultHome.tsx"),
  sidebarConfig: path.join(ROOT, "apps/frontend/src/components/layout/sidebar-config.ts"),
  maintenanceHome: path.join(ROOT, "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx"),
  allCatalogsMap: path.join(ROOT, "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx"),
  fleetTable: path.join(ROOT, "apps/frontend/src/pages/maintenance/FleetTablePage.tsx"),
  serviceLocation: path.join(ROOT, "apps/frontend/src/pages/maintenance/ServiceLocationPage.tsx"),
  vendorsPage: path.join(ROOT, "apps/frontend/src/pages/maintenance/vendors/VendorsPage.tsx"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function countCatalogEntries(source) {
  const block = source.match(/key:\s*"maintenance"[\s\S]*?catalogs:\s*\[([\s\S]*?)\]\s*,\s*\}/);
  if (!block) return 0;
  return (block[1].match(/catalogKey:/g) ?? []).length;
}

function extractFlyoutPaths(sidebarSource) {
  const block = sidebarSource.match(/case "maintenance":[\s\S]*?return MAINTENANCE_MODULE_NAV_LINKS\.map\([\s\S]*?\);/);
  return block ? block[0] : "";
}

function main() {
  const failures = [];
  const navConfig = read(paths.navConfig);
  const homePage = read(paths.homePage);
  const sidebarConfig = read(paths.sidebarConfig);
  const maintenanceHome = read(paths.maintenanceHome);
  const allCatalogsMap = read(paths.allCatalogsMap);
  const fleetTable = read(paths.fleetTable);
  const serviceLocation = read(paths.serviceLocation);
  const vendorsPage = read(paths.vendorsPage);
  const archDesign = read(paths.archDesign);

  const expected = {
    moduleNav: 11,
    masterData: 9,
    dashboardTabs: 10,
    operationLinks: 11,
    listsCatalogs: 9,
  };

  if (navConfig.match(/MAINTENANCE_MODULE_NAV_LINKS[\s\S]*?\];/g)?.[0]?.match(/path:/g)?.length !== expected.moduleNav) {
    failures.push(`MAINTENANCE_MODULE_NAV_LINKS must have ${expected.moduleNav} entries`);
  }
  if (navConfig.match(/MAINTENANCE_MASTER_DATA_LINKS[\s\S]*?\];/g)?.[0]?.match(/path:/g)?.length !== expected.masterData) {
    failures.push(`MAINTENANCE_MASTER_DATA_LINKS must have ${expected.masterData} entries (includes Drivers)`);
  }
  if (navConfig.match(/MAINTENANCE_DASHBOARD_TAB_LINKS[\s\S]*?\];/g)?.[0]?.match(/path:/g)?.length !== expected.dashboardTabs) {
    failures.push(`MAINTENANCE_DASHBOARD_TAB_LINKS must have ${expected.dashboardTabs} entries`);
  }
  if (!navConfig.includes("...MAINTENANCE_DASHBOARD_TAB_LINKS")) {
    failures.push("MAINTENANCE_OPERATION_LINKS must spread MAINTENANCE_DASHBOARD_TAB_LINKS after Dashboard");
  }
  if (!navConfig.includes('{ label: "Dashboard", path: "/maintenance" }')) {
    failures.push("MAINTENANCE_OPERATION_LINKS must include Dashboard entry");
  }
  if (!navConfig.includes("/maintenance/drivers")) {
    failures.push("MAINTENANCE_MASTER_DATA_LINKS must include /maintenance/drivers");
  }
  if (!navConfig.includes("MAINTENANCE_HOME_QUICK_JUMP_COUNT = MAINTENANCE_MODULE_NAV_COUNT")) {
    failures.push("MAINTENANCE_HOME_QUICK_JUMP_COUNT must alias MAINTENANCE_MODULE_NAV_COUNT");
  }
  if (!navConfig.includes(`MAINTENANCE_LISTS_CATALOG_COUNT = ${expected.listsCatalogs}`)) {
    failures.push(`MAINTENANCE_LISTS_CATALOG_COUNT must be ${expected.listsCatalogs}`);
  }

  if (homePage.includes("count: 14") || homePage.includes('count: 14,')) {
    failures.push("DefaultHome must not hardcode Maintenance quick-jump count 14");
  }
  if (!homePage.includes("MAINTENANCE_HOME_QUICK_JUMP_COUNT")) {
    failures.push("DefaultHome must import MAINTENANCE_HOME_QUICK_JUMP_COUNT");
  }

  if (!sidebarConfig.includes("MAINTENANCE_MODULE_NAV_LINKS")) {
    failures.push("sidebar-config must derive maintenance flyout from MAINTENANCE_MODULE_NAV_LINKS");
  }
  const flyoutBlock = extractFlyoutPaths(sidebarConfig);
  if (!flyoutBlock.includes("MAINTENANCE_MODULE_NAV_LINKS.map")) {
    failures.push("sidebar maintenance flyout must map MAINTENANCE_MODULE_NAV_LINKS");
  }

  if (!maintenanceHome.includes("../../components/maintenance/MAINTENANCE_NAV_CONFIG")) {
    failures.push("MaintenanceHome must import nav links from MAINTENANCE_NAV_CONFIG");
  }

  const catalogCount = countCatalogEntries(allCatalogsMap);
  const expectedListsCatalogs = 9;
  if (catalogCount !== expectedListsCatalogs) {
    failures.push(`AllCatalogsMap maintenance domain must have ${expectedListsCatalogs} catalogs (found ${catalogCount})`);
  }

  if (/>\s*\+\s*Create\s*<\//.test(fleetTable)) {
    failures.push("FleetTablePage empty state must not expose dead + Create button");
  }
  if (/>\s*\+\s*Create\s*<\//.test(serviceLocation)) {
    failures.push("ServiceLocationPage empty state must not expose dead + Create button");
  }
  if (!/CSV Import/.test(vendorsPage)) {
    failures.push("VendorsPage must expose functional CSV Import button (B29)");
  }
  if (!/\+ Create Vendor/.test(vendorsPage)) {
    failures.push("VendorsPage must expose + Create Vendor action (B29)");
  }
  if (/CSV Import[\s\S]{0,120}\+\s*Create/.test(maintenanceHome.match(/parts_inventory[\s\S]*?PartsInventoryTable/)?.[0] ?? "")) {
    failures.push("MaintenanceHome parts_inventory tab must not expose dead CSV Import / + Create buttons");
  }

  if (!archDesign.includes("Maintenance module nav counts")) {
    failures.push("ARCHITECTURAL_DESIGN must document Maintenance module nav counts (B24)");
  }

  if (failures.length > 0) {
    console.error("verify:maint-nav-count-reconcile FAILED");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log("verify:maint-nav-count-reconcile OK");
}

main();
