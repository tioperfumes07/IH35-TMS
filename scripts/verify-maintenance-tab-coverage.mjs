#!/usr/bin/env node
/**
 * C-36 — Maintenance tab coverage (9 visible tabs + retired remaps).
 * Paths for retired peers stay mounted (Rule 07); SUBNAV is exactly 9.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(new URL("../apps/frontend/package.json", import.meta.url));
const ts = require("typescript");
const HOME_PANELS = ["MaintenancePmCountdownCards", "MaintEnginesStatusWidget", "MaintenanceAlertsCard", "InTransitTriageBand", "SevereAlertsBand"];
export function validateHomePanel(name, text) {
  const source = ts.createSourceFile(`${name}.tsx`, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let panels = 0;
  function visit(node) {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === "V3Panel") panels++;
    ts.forEachChild(node, visit);
  }
  visit(source);
  return panels ? [] : [`Home panel ${name} must mount the shared V3Panel`];
}

// 443.280: preserve capabilities on dedicated routes, not mounted below Home.
export function validateBoardLayout(home, routes) {
  const errors = [];
  const source = ts.createSourceFile("MaintenanceHome.tsx", home, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const boards = [];
  const strips = [];
  function visit(node) {
    if (ts.isConditionalExpression(node) && node.condition.getText(source) === 'tab === "rm_status_board"') boards.push(node.whenTrue);
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(source) === "IntegrationsStrip") strips.push(node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (boards.length !== 1) errors.push("Home must have exactly one board body");
  for (const board of boards) {
    const body = board.getText(source);
    for (const name of ["IntegrationsStrip", "RMBucketsGrid", "RMStatStrip", "ArrivingSoonPage", "PredictiveAlertsPage", "DtcAutoWorkOrdersCard", "RoadServiceActivePanel", "details"]) {
      if (new RegExp(`<${name}\\b`).test(body)) errors.push(`Home mounts legacy ${name}`);
    }
    for (const name of ["MaintenanceHomeSummaryPanels", "FleetHealthLine", "V3KpiTile"]) if (!body.includes(`<${name}`)) errors.push(`Home missing ${name}`);
  }
  if (strips.length !== 1) errors.push("IntegrationsStrip must remain reachable once in Settings");
  for (const strip of strips) {
    let parent = strip.parent;
    while (parent && !ts.isConditionalExpression(parent)) parent = parent.parent;
    if (!parent || parent.condition.getText(source) !== 'tab === "settings"' || !parent.whenTrue.getText(source).includes("<IntegrationsStrip")) errors.push("IntegrationsStrip must mount only in Settings");
  }
  for (const [tab, component] of [["arriving_soon", "ArrivingSoonPage"], ["predictive_alerts", "PredictiveAlertsPage"]]) {
    let reachable = false;
    function find(node) {
      if (ts.isConditionalExpression(node) && node.condition.getText(source) === `tab === "${tab}"` && node.whenTrue.getText(source).includes(`<${component}`)) reachable = true;
      ts.forEachChild(node, find);
    }
    find(source);
    if (!reachable) errors.push(`${component} must remain on its own route`);
  }
  if (!home.includes('/maintenance/active-wos?view=workflow') || !home.includes('<RMBucketsGrid')) errors.push("Active WOs workflow must remain reachable");
  if (!home.includes('const showWorkflow = tab === "active_wos" && searchParams.get("view") === "workflow"')) errors.push("Workflow selection must derive from its route and view");
  let workflowMount = false;
  function findWorkflow(node) {
    if (ts.isConditionalExpression(node) && node.condition.getText(source) === "showWorkflow" && node.whenTrue.getText(source).includes("<RMBucketsGrid")) workflowMount = true;
    ts.forEachChild(node, findWorkflow);
  }
  findWorkflow(source);
  if (!workflowMount) errors.push("Selected workflow must mount RMBucketsGrid");
  for (const [url, tab] of [["arriving-soon", "arriving_soon"], ["predictive-alerts", "predictive_alerts"]]) {
    if (!routes.includes(`if (norm === "/maintenance/${url}") return "${tab}";`)) errors.push(`${url} must resolve to ${tab}`);
  }
  if (/norm === "\/maintenance\/(?:arriving-soon|predictive-alerts)"[\s\S]{0,100}return "rm_status_board"/.test(routes)) errors.push("Summary View all must not remap back to Home");
  return errors;
}

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

// C-36 locked the owner's nine; ROUND 313 item 3 (Lead order, d9ca1c5051 #23853) added PM Due / Faults / In Shop after
// Active WOs and Cost/mi after Parts Inventory. The lock is the thirteen, in this order — nothing else, nothing missing.
const C36_SUBNAV_IDS = [
  "rm_status_board",
  "fleet_table",
  "active_wos",
  "pm_due", // R313
  "faults", // R313
  "in_shop", // R313
  "service_location",
  "driver_reports",
  "road_service",
  "parts_inventory",
  "cost_per_mile", // R313 — a Reports surface (/reports/maintenance-cost-per-unit), see TAB_PATH_OUTSIDE_MAINTENANCE
  "integrity_report",
  "settings",
];

/** A tab that opens a surface outside /maintenance, pinned to its exact path (R313: Cost/mi is the Reports page). */
const TAB_PATH_OUTSIDE_MAINTENANCE = { cost_per_mile: "/reports/maintenance-cost-per-unit" };

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
  // ROUND 441.6: route state = the MOST SPECIFIC matching tab (an index tab like /finance no longer stays current on
  // /finance/overview). Still derived from the route — never from a prop or local state.
  if (
    !navySubNavSrc.includes('aria-current={activeTo === item.to ? "page" : undefined}') ||
    !/const activeTo = mostSpecificActiveTo\(\s*pathname,/.test(navySubNavSrc)
  ) {
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

  // C-36 + R313 — SUBNAV is exactly the locked list above (order locked).
  const subnavBlock = homeSrc.match(/const SUBNAV = \[([\s\S]*?)\] as const/);
  const subnavIds = subnavBlock
    ? [...subnavBlock[1].matchAll(/\{\s*id:\s*"([^"]+)"\s*,\s*label:/g)].map((m) => m[1])
    : [];
  if (subnavIds.length !== C36_SUBNAV_IDS.length) {
    failures.push(`C-36 SUBNAV must have exactly ${C36_SUBNAV_IDS.length} tabs (found ${subnavIds.length}: ${subnavIds.join(",")})`);
  }
  for (let i = 0; i < C36_SUBNAV_IDS.length; i++) {
    if (subnavIds[i] !== C36_SUBNAV_IDS[i]) {
      failures.push(`C-36 SUBNAV[${i}] expected ${C36_SUBNAV_IDS[i]} got ${subnavIds[i] ?? "missing"}`);
    }
  }
  for (const id of subnavIds) {
    const outside = TAB_PATH_OUTSIDE_MAINTENANCE[id];
    if (outside ? !routeManifestSrc.includes(`${id}: "${outside}"`) : !new RegExp(`${id}\\s*:\\s*"/maintenance`).test(routeManifestSrc)) {
      failures.push(`missing_MAINTENANCE_TAB_PATH:${id}`);
    }
  }
  failures.push(...validateBoardLayout(homeSrc, routeManifestSrc));
  for (const name of HOME_PANELS) failures.push(...validateHomePanel(name, readIfExists(path.join(ROOT, `apps/frontend/src/pages/maintenance/components/${name}.tsx`))));
  if (!homeSrc.includes("DRIVER_REPORT_KIND_OPTIONS") && !homeSrc.includes("driverReportKind")) {
    failures.push("C-36: Driver Reports must expose Kind (damage / in-transit / DVIR)");
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

export function boardLayoutSelftest(home, routes) {
  const plants = [
    ["embedded arrivals", home.replace("<MaintenanceHomeSummaryPanels", "<ArrivingSoonPage")],
    ["embedded risk", home.replace("<MaintenanceHomeSummaryPanels", "<PredictiveAlertsPage")],
    ["collapsed workflow", home.replace("<MaintenanceHomeSummaryPanels", "<details><RMBucketsGrid /></details><MaintenanceHomeSummaryPanels")],
    ["integrations restored to Home", home.replace('tab === "settings" ? <IntegrationsStrip', 'isHomeTab ? <IntegrationsStrip')],
    ["arrivals route removed", home.replace('tab === "arriving_soon"', 'tab === "removed"')],
    ["workflow link removed", home.replaceAll('/maintenance/active-wos?view=workflow', '/removed')],
    ["workflow disabled", home.replace('const showWorkflow = tab === "active_wos" && searchParams.get("view") === "workflow"', 'const showWorkflow = false')],
    ["workflow never mounted", home.replace('{showWorkflow ? (rmStatusQuery.isError', '{false ? (rmStatusQuery.isError')],
  ];
  if (validateBoardLayout(home, routes).length) throw new Error("selftest clean fixture is not clean");
  for (const [label, mutated] of plants) {
    if (!validateBoardLayout(mutated, routes).length) throw new Error(`plant escaped: ${label}`);
    console.log(`PASS plant: ${label}`);
  }
  const wrongRoute = routes.replace('if (norm === "/maintenance/arriving-soon") return "arriving_soon";', 'if (norm === "/maintenance/arriving-soon") return "fleet_table";');
  if (!validateBoardLayout(home, wrongRoute).length) throw new Error("plant escaped: arrivals misrouted to fleet");
  console.log("PASS plant: arrivals misrouted to fleet");
  console.log(`board-layout selftest ${plants.length + 2}/${plants.length + 2}`);
  for (const name of HOME_PANELS) {
    const original = readIfExists(path.join(ROOT, `apps/frontend/src/pages/maintenance/components/${name}.tsx`));
    if (validateHomePanel(name, original).length) throw new Error(`clean panel rejected: ${name}`);
    if (!validateHomePanel(name, original.replaceAll("V3Panel", "LegacyPanel")).length) throw new Error(`legacy panel plant escaped: ${name}`);
  }
  console.log("Home panel selftest 10/10 (five real panels + five legacy replacements)");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
  if (process.argv.includes("--selftest")) boardLayoutSelftest(readIfExists(path.join(ROOT, "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx")), readIfExists(path.join(ROOT, "apps/frontend/src/router/route-manifest.ts")));
}
