#!/usr/bin/env node
/**
 * Block A24-11: Driver PWA live data parity (home + equipment + bottom nav).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  pwaLiveRoutes: path.join(ROOT, "apps/backend/src/driver/pwa-live.routes.ts"),
  driverIndex: path.join(ROOT, "apps/backend/src/driver/index.ts"),
  backendTest: path.join(ROOT, "apps/backend/src/driver/__tests__/pwa-live.routes.test.ts"),
  homePage: path.join(ROOT, "apps/driver-pwa/src/pages/Home.tsx"),
  equipmentPage: path.join(ROOT, "apps/driver-pwa/src/pages/Equipment.tsx"),
  bottomNav: path.join(ROOT, "apps/driver-pwa/src/components/BottomNav.tsx"),
  pwaLiveApi: path.join(ROOT, "apps/driver-pwa/src/api/pwa-live.ts"),
  pwaApp: path.join(ROOT, "apps/driver-pwa/src/App.tsx"),
  pwaTest: path.join(ROOT, "apps/driver-pwa/src/pages/__tests__/HomeLiveData.test.ts"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`[verify-drivers-pwa-live-data] ${msg}`);
  process.exit(1);
}

function main() {
  const pwaLiveRoutes = read(paths.pwaLiveRoutes);
  const driverIndex = read(paths.driverIndex);
  const backendTest = read(paths.backendTest);
  const homePage = read(paths.homePage);
  const equipmentPage = read(paths.equipmentPage);
  const bottomNav = read(paths.bottomNav);
  const pwaLiveApi = read(paths.pwaLiveApi);
  const pwaApp = read(paths.pwaApp);
  const pwaTest = read(paths.pwaTest);
  const archDesign = read(paths.archDesign);
  const failures = [];

  if (!pwaLiveRoutes.includes("/api/v1/driver-pwa/hos-clocks")) failures.push("HOS clocks route required");
  if (!pwaLiveRoutes.includes("/api/v1/driver-pwa/recent-fuel-transactions")) failures.push("Recent fuel route required");
  if (!pwaLiveRoutes.includes("/api/v1/driver-pwa/equipment")) failures.push("Equipment route required");
  if (!driverIndex.includes("registerDriverPwaLiveRoutes")) failures.push("Driver PWA live routes must register");
  if (!homePage.includes("getPwaHosClocks")) failures.push("Home must fetch live HOS clocks");
  if (!homePage.includes("getMyLoadsToday")) failures.push("Home must fetch live loads");
  if (!homePage.includes("getRecentFuelTransactions")) failures.push("Home must fetch recent fuel transactions");
  if (homePage.includes("Houston, TX → Atlanta, GA")) failures.push("Home must not retain hardcoded load demo data");
  if (!equipmentPage.includes("EquipmentPage")) failures.push("Equipment page required");
  if (!bottomNav.includes('to: "/hos"')) failures.push("Bottom nav HOS shortcut required");
  if (!bottomNav.includes('to: "/documents"')) failures.push("Bottom nav Documents shortcut required");
  if (!pwaLiveApi.includes("getPwaHosClocks")) failures.push("PWA live API client required");
  if (!pwaApp.includes('path="/equipment"')) failures.push("App must register /equipment route");
  if (!backendTest.includes("A24-11")) failures.push("Backend vitest must reference A24-11");
  if (!pwaTest.includes("A24-11")) failures.push("PWA vitest must reference A24-11");

  if (!archDesign.includes("verify:drivers-pwa-live-data")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:drivers-pwa-live-data");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail("FAILED");
  }

  console.log("[verify-drivers-pwa-live-data] OK");
}

main();
