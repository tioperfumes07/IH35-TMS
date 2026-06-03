#!/usr/bin/env node
/**
 * Block A24-2: Drivers module count + nav integrity (canonical 9 subtabs / 5 list filters / 7 KPIs).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const EXPECTED_SUBNAV_COUNT = 9;
const EXPECTED_LIST_STATUS_COUNT = 5;
const EXPECTED_KPI_COUNT = 7;
const EXPECTED_MODULE_NAV_COUNT = 2;

const paths = {
  tabsConfig: path.join(ROOT, "apps/frontend/src/components/drivers/DRIVERS_TABS_CONFIG.ts"),
  driversPage: path.join(ROOT, "apps/frontend/src/pages/Drivers.tsx"),
  homePage: path.join(ROOT, "apps/frontend/src/pages/home/HomePage.tsx"),
  sidebarConfig: path.join(ROOT, "apps/frontend/src/components/layout/sidebar-config.ts"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
  navIntegrity: path.join(ROOT, "scripts/verify-nav-integrity.mjs"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`[verify-drivers-count-nav-integrity] ${msg}`);
  process.exit(1);
}

function main() {
  const tabsConfig = read(paths.tabsConfig);
  const driversPage = read(paths.driversPage);
  const homePage = read(paths.homePage);
  const sidebarConfig = read(paths.sidebarConfig);
  const archDesign = read(paths.archDesign);
  const navIntegrity = read(paths.navIntegrity);
  const failures = [];

  if (!tabsConfig.includes(`DRIVERS_CANONICAL_SUBNAV_COUNT = ${EXPECTED_SUBNAV_COUNT}`)) {
    failures.push("DRIVERS_CANONICAL_SUBNAV_COUNT must be 9");
  }
  const subnavBlock = tabsConfig.slice(
    tabsConfig.indexOf("export const DRIVERS_SUBNAV"),
    tabsConfig.indexOf("export const DRIVERS_LIST_STATUS_TABS")
  );
  const subnavCount = (subnavBlock.match(/\{ id:/g) ?? []).length;
  if (subnavCount !== EXPECTED_SUBNAV_COUNT) {
    failures.push(`DRIVERS_SUBNAV must have ${EXPECTED_SUBNAV_COUNT} entries (found ${subnavCount})`);
  }
  if (!tabsConfig.includes(`DRIVERS_CANONICAL_LIST_STATUS_TAB_COUNT = ${EXPECTED_LIST_STATUS_COUNT}`)) {
    failures.push("DRIVERS_CANONICAL_LIST_STATUS_TAB_COUNT must be 5");
  }
  if (!tabsConfig.includes(`DRIVERS_CANONICAL_KPI_COUNT = ${EXPECTED_KPI_COUNT}`)) {
    failures.push("DRIVERS_CANONICAL_KPI_COUNT must be 7");
  }
  if (!tabsConfig.includes(`DRIVERS_CANONICAL_MODULE_NAV_COUNT = ${EXPECTED_MODULE_NAV_COUNT}`)) {
    failures.push("DRIVERS_CANONICAL_MODULE_NAV_COUNT must be 2");
  }
  if (!driversPage.includes("DRIVERS_TABS_CONFIG")) {
    failures.push("DriversPage must import DRIVERS_TABS_CONFIG");
  }
  if (driversPage.includes("const DRIVERS_SUBNAV = [")) {
    failures.push("DriversPage must not duplicate DRIVERS_SUBNAV — use DRIVERS_TABS_CONFIG");
  }
  if (!homePage.includes("DRIVERS_CANONICAL_SUBNAV_COUNT")) {
    failures.push("HomePage must import DRIVERS_CANONICAL_SUBNAV_COUNT");
  }
  if (homePage.includes('title: "Drivers"') && homePage.includes("count: 3, to: \"/drivers\"")) {
    failures.push("HomePage must not hardcode Drivers quick-jump count 3");
  }
  if (!sidebarConfig.includes('case "drivers":')) {
    failures.push("sidebar-config must include drivers flyout case");
  }
  const driversFlyout = sidebarConfig.split('case "drivers"')[1]?.split("case ")[0] ?? "";
  if (!driversFlyout.includes('to: "/drivers"')) {
    failures.push("Drivers sidebar flyout must link to /drivers");
  }
  if (!driversFlyout.includes("/driver-finance/cash-advance-requests")) {
    failures.push("Drivers sidebar flyout must include cash advance requests route");
  }
  if (!archDesign.includes("9 query-synced subtabs")) {
    failures.push("ARCHITECTURAL_DESIGN must document 9 query-synced subtabs");
  }
  if (!archDesign.includes("verify:drivers-count-nav-integrity")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:drivers-count-nav-integrity");
  }
  if (!navIntegrity.includes("DRIVERS_TABS_CONFIG")) {
    failures.push("verify-nav-integrity must read DRIVERS_MODULE_NAV_PATHS from DRIVERS_TABS_CONFIG");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail("FAILED");
  }

  console.log("[verify-drivers-count-nav-integrity] OK");
}

main();
