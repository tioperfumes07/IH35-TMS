#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_MAINT_TAB_COVERAGE_ROOT ?? process.cwd();
const manifestPath =
  process.env.VERIFY_MAINT_TAB_COVERAGE_MANIFEST_PATH ??
  path.join(ROOT, "apps/frontend/src/routes/manifest.tsx");
const dashboardRoutesPath =
  process.env.VERIFY_MAINT_TAB_COVERAGE_DASHBOARD_PATH ??
  path.join(ROOT, "apps/backend/src/maintenance/dashboard.routes.ts");

const tabs = [
  { id: "maintenance-home", route: "/maintenance", component: "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx" },
  { id: "fleet-table", route: "/maintenance/fleet-table", component: "apps/frontend/src/pages/maintenance/FleetTablePage.tsx" },
  { id: "rm-status-board", route: "/maintenance/rm-status-board", component: "apps/frontend/src/pages/maintenance/components/RMBucketsGrid.tsx" },
  { id: "service-location", route: "/maintenance/service-location", component: "apps/frontend/src/pages/maintenance/ServiceLocationPage.tsx" },
  { id: "arriving-soon", route: "/maintenance/arriving-soon", component: "apps/frontend/src/pages/maintenance/ArrivingSoonPage.tsx" },
  { id: "in-transit-issues", route: "/maintenance/in-transit-issues", component: "apps/frontend/src/pages/maintenance/components/InTransitTriageBand.tsx" },
  { id: "damage-reports", route: "/maintenance/damage-reports", component: "apps/frontend/src/pages/maintenance/DriverReportsQueuePage.tsx" },
  { id: "severe-repairs", route: "/maintenance/severe-repairs", component: "apps/frontend/src/pages/maintenance/components/SevereRepairOosTab.tsx" },
  { id: "parts-inventory", route: "/maintenance/parts-inventory", component: "apps/frontend/src/pages/maintenance/components/PartsInventoryTable.tsx" },
  { id: "settings", route: "/maintenance/settings", component: "apps/frontend/src/pages/maintenance/MaintenanceSettingsPage.tsx" },
];

const requiredKpiEndpoints = [
  "/api/v1/maintenance/dashboard/kpis",
  "/api/v1/maintenance/fleet-table/kpis",
  "/api/v1/maintenance/service-location/kpis",
  "/api/v1/maintenance/parts-inventory/kpis",
];

function readIfExists(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function main() {
  const failures = [];
  const manifestSource = readIfExists(manifestPath);
  const dashboardSource = readIfExists(dashboardRoutesPath);

  for (const tab of tabs) {
    const componentPath = path.join(ROOT, tab.component);
    if (!fs.existsSync(componentPath)) {
      failures.push(`missing_component:${tab.id}:${tab.component}`);
    }
    if (!manifestSource.includes(`path="${tab.route}"`)) {
      failures.push(`missing_route:${tab.id}:${tab.route}`);
    }
  }

  // LV-MAINT-RM-STATUS-BOARD-SHELL: dedicated board must be path-derived + Live-testidable.
  const homePath = path.join(ROOT, "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx");
  const homeSrc = readIfExists(homePath);
  const navySubNavPath = path.join(ROOT, "apps/frontend/src/components/layout/NavyPageSubNav.tsx");
  const navySubNavSrc = readIfExists(navySubNavPath);
  if (!homeSrc.includes('data-testid="rm-status-board"')) {
    failures.push("missing_testid:rm-status-board on MaintenanceHome");
  }
  if (!homeSrc.includes("maintenanceTabFromPath(location.pathname)")) {
    failures.push("rm_status_board tab must derive from location.pathname (not stale useState)");
  }
  if (!homeSrc.includes("maintenanceTabFromPath(location.pathname) ?? initialTab")) {
    failures.push("tab must prefer path leaf then MaintenanceTabRoute initialTab (never invent active_wos)");
  }
  if (!navySubNavSrc.includes('aria-current={active ? "page" : undefined}')) {
    failures.push("shared NavyPageSubNav must set aria-current from controlled tab id");
  }
  if (!navySubNavSrc.includes('aria-current={isActive(pathname, item.to) ? "page" : undefined}')) {
    failures.push("shared NavyPageSubNav must set aria-current from route state");
  }
  if (homeSrc.includes("<NavLink") && homeSrc.includes("data-maintenance-subtab")) {
    failures.push("SUBNAV must use Link+tab-id aria-current, not NavLink path matching");
  }
  const bucketsPath = path.join(ROOT, "apps/frontend/src/pages/maintenance/components/RMBucketsGrid.tsx");
  const bucketsSrc = readIfExists(bucketsPath);
  if (!bucketsSrc.includes('data-testid="rm-buckets-grid"')) {
    failures.push("missing_testid:rm-buckets-grid on RMBucketsGrid");
  }

  // LV-MAINT-SUBNAV-ORPHAN-PATHS — every MaintenanceHome SUBNAV id must have a path map entry
  // (otherwise NavLink falls through to /maintenance dashboard shell).
  const routeManifestPath = path.join(ROOT, "apps/frontend/src/router/route-manifest.ts");
  const routeManifestSrc = readIfExists(routeManifestPath);
  const subnavIds = [...homeSrc.matchAll(/\{\s*id:\s*"([^"]+)"\s*,\s*label:/g)].map((m) => m[1]);
  for (const id of subnavIds) {
    if (!new RegExp(`${id}\\s*:\\s*"/maintenance/`).test(routeManifestSrc)) {
      failures.push(`missing_MAINTENANCE_TAB_PATH:${id}`);
    }
  }
  if (!manifestSource.includes('path="/maintenance/dvir"')) {
    failures.push("missing_route:dvir_alias:/maintenance/dvir");
  }
  if (!routeManifestSrc.includes('norm === "/maintenance/dvir"')) {
    failures.push("maintenanceTabFromPath must map /maintenance/dvir → pre_flight_dvir");
  }
  if (!routeManifestSrc.includes("return null")) {
    failures.push("maintenanceTabFromPath must return null for bare /maintenance and unknown paths");
  }
  for (const testid of [
    "maintenance-parts-inventory-tab",
    "maintenance-road-service-tab",
    "maintenance-pre-flight-dvir-tab",
    "maintenance-fleet-table-tab",
    "maintenance-damage-reports-tab",
    "maintenance-active-wos-tab",
    "maintenance-service-location-tab",
    "maintenance-arriving-soon-tab",
  ]) {
    if (!homeSrc.includes(`data-testid="${testid}"`)) {
      failures.push(`missing_testid:${testid}`);
    }
  }
  if (!manifestSource.includes('path="/settings/company"')) {
    failures.push("missing_route:settings_company_alias:/settings/company");
  }

  for (const endpoint of requiredKpiEndpoints) {
    if (!dashboardSource.includes(endpoint)) {
      failures.push(`missing_kpi_endpoint:${endpoint}`);
    }
  }

  if (failures.length > 0) {
    console.error("verify:maintenance-tab-coverage FAIL");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("verify:maintenance-tab-coverage OK");
}

main();
