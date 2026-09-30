#!/usr/bin/env node
/**
 * C-36 — Maintenance tab coverage (9 visible tabs + retired remaps).
 * Paths for retired peers stay mounted (Rule 07); SUBNAV is exactly 9.
 */
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
  { id: "driver-reports", route: "/maintenance/driver-reports", component: "apps/frontend/src/pages/maintenance/DriverReportsQueuePage.tsx" },
  { id: "severe-repairs", route: "/maintenance/severe-repairs", component: "apps/frontend/src/pages/maintenance/components/SevereRepairOosTab.tsx" },
  { id: "parts-inventory", route: "/maintenance/parts-inventory", component: "apps/frontend/src/pages/maintenance/components/PartsInventoryTable.tsx" },
  { id: "integrity-report", route: "/maintenance/integrity-report", component: "apps/frontend/src/pages/maintenance/IntegrityReportPage.tsx" },
  { id: "settings", route: "/maintenance/settings", component: "apps/frontend/src/pages/maintenance/MaintenanceSettingsPage.tsx" },
];

const requiredKpiEndpoints = [
  "/api/v1/maintenance/dashboard/kpis",
  "/api/v1/maintenance/fleet-table/kpis",
  "/api/v1/maintenance/service-location/kpis",
  "/api/v1/maintenance/parts-inventory/kpis",
];

const C36_SUBNAV_IDS = [
  "rm_status_board",
  "fleet_table",
  "active_wos",
  "service_location",
  "driver_reports",
  "road_service",
  "parts_inventory",
  "integrity_report",
  "settings",
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

  const homePath = path.join(ROOT, "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx");
  const homeSrc = readIfExists(homePath);
  const navySubNavPath = path.join(ROOT, "apps/frontend/src/components/layout/NavyPageSubNav.tsx");
  const navySubNavSrc = readIfExists(navySubNavPath);
  if (!homeSrc.includes('data-testid="rm-status-board"')) {
    failures.push("missing_testid:rm-status-board on MaintenanceHome");
  }
  if (!homeSrc.includes('label: "Home"')) {
    failures.push("C-36: Home tab must state Home (not R&M Status Board)");
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

  const routeManifestPath = path.join(ROOT, "apps/frontend/src/router/route-manifest.ts");
  const routeManifestSrc = readIfExists(routeManifestPath);

  // C-36 — SUBNAV is exactly the 9 owner-canvas tabs (order locked).
  const subnavBlock = homeSrc.match(/const SUBNAV = \[([\s\S]*?)\] as const/);
  const subnavIds = subnavBlock
    ? [...subnavBlock[1].matchAll(/\{\s*id:\s*"([^"]+)"\s*,\s*label:/g)].map((m) => m[1])
    : [];
  if (subnavIds.length !== 9) {
    failures.push(`C-36 SUBNAV must have exactly 9 tabs (found ${subnavIds.length}: ${subnavIds.join(",")})`);
  }
  for (let i = 0; i < C36_SUBNAV_IDS.length; i++) {
    if (subnavIds[i] !== C36_SUBNAV_IDS[i]) {
      failures.push(`C-36 SUBNAV[${i}] expected ${C36_SUBNAV_IDS[i]} got ${subnavIds[i] ?? "missing"}`);
    }
  }
  for (const id of subnavIds) {
    if (!new RegExp(`${id}\\s*:\\s*"/maintenance`).test(routeManifestSrc)) {
      failures.push(`missing_MAINTENANCE_TAB_PATH:${id}`);
    }
  }
  if (!homeSrc.includes("IntegrationsStrip") || !homeSrc.includes("isHomeTab ? <IntegrationsStrip")) {
    failures.push("C-36: IntegrationsStrip must render once on Home only");
  }
  if (!homeSrc.includes("DRIVER_REPORT_KIND_OPTIONS") && !homeSrc.includes("driverReportKind")) {
    failures.push("C-36: Driver Reports must expose Kind (damage / in-transit / DVIR)");
  }
  if (!homeSrc.includes("maintenance-home-folded-panels")) {
    failures.push("C-36: Arriving Soon + At Risk must fold into Home");
  }

  if (!manifestSource.includes('path="/maintenance/dvir"')) {
    failures.push("missing_route:dvir_alias:/maintenance/dvir");
  }
  if (!routeManifestSrc.includes('norm === "/maintenance/dvir"')) {
    failures.push("maintenanceTabFromPath must map /maintenance/dvir → driver_reports (C-36)");
  }
  if (!routeManifestSrc.includes('return "driver_reports"')) {
    failures.push("C-36: damage / in-transit / DVIR paths must remap to driver_reports");
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
    "maintenance-integrity-report-tab",
  ]) {
    if (!homeSrc.includes(`data-testid="${testid}"`) && !readIfExists(path.join(ROOT, "apps/frontend/src/pages/maintenance/IntegrityReportPage.tsx")).includes(`data-testid="${testid}"`)) {
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
