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
