#!/usr/bin/env node
/** @matrix-built {"modules":["cash-flow","fuel","home","program","reports"],"cols":["connectivity"],"leafRe":"^(home|tab\\.(actual_vs_projected|manual_daily_projections)|create\\.manual_projection|card_overage|route\\.(root|home|home_ops)|role\\.(owner|dispatcher|accountant|safety|manager|default)|surface\\.(qbo_style|kpi_cards|attention_list|quick_actions|fleet_restore)|home\\.panel\\.(accounting_pending_approvals|dispatcher_active_loads|dispatcher_pending_actions|driver_manager_attention|fleet_snapshot|safety_alerts)|matrix\\.(module_pill|request_time_feed|live_api)|legacy\\.board|scenario\\.redirect|hop\\.audit_coverage|program\\.parity\\.legacy_audit_scoreboard_page|home\\.kpi_strip|report\\.(management|ifta|ifta_preparer|ar_aging|ap_aging|trial_balance|profit_loss|balance_sheet|cash_flow_statement|cash_flow|per_truck_cpm|cash_flow_overview|settlement_summary|profit_per_truck|cancellations|late_arrival|fuel_reconciliation|maintenance_cost_per_unit|dispatch_margin|geofence_dwell|booking_gap|deadhead|scheduled|scheduled_custom)|runner\\.(profit_truck_mtd|dispatch_board|detention_claims|cash_position|driver_pay_history|driver_settlement|fleet_utilization|fuel_savings|fuel_price_variance|csa_fleet|hos_violations|ifta_quarterly|dot_audit_pack|saved_owner_pack|saved_quarter_close|maint_cost_unit)|audit\\.(activity_by_user|activity_by_module|financial_change_log|maintenance_decision_log|deduction_trail|void_reversal|period_close_history)|reports\\.(modal\\.(lane_detail|schedule_report)|panel\\.(report_flyout|scheduled_reports)|sheet\\.balance_sheet_page|flyout\\.report_flyout))$","task":"LINK-F5158-ANALYTICAL-DASHBOARD-SURFACE-CONNECTIVITY","vertical":"class-sweep"} */
import fs from "node:fs";
import process from "node:process";

const FILES = {
  cashFlow: "apps/frontend/src/pages/cash-flow/CashFlowPage.tsx",
  cashManual: "apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx",
  fuelCard: "apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx",
  home: "apps/frontend/src/pages/home/HomePage.tsx",
  ownerHome: "apps/frontend/src/pages/home/OwnerHome.tsx",
  defaultHome: "apps/frontend/src/pages/home/roles/DefaultHome.tsx",
  dispatcherHome: "apps/frontend/src/pages/home/roles/DispatcherHome.tsx",
  accountingHome: "apps/frontend/src/pages/home/roles/AccountingHome.tsx",
  safetyHome: "apps/frontend/src/pages/home/roles/SafetyHome.tsx",
  managerHome: "apps/frontend/src/pages/home/roles/DriverManagerHome.tsx",
  qboHome: "apps/frontend/src/pages/home/QboStyleHomePage.tsx",
  matrix: "apps/frontend/src/pages/program/ModuleMatrixPreviewPage.tsx",
  tracker: "apps/frontend/src/pages/program/ProgramTrackerPage.tsx",
  scenario: "apps/frontend/src/pages/program/scenario-tracker/ScenarioTrackerHome.tsx",
  programNav: "apps/frontend/src/pages/program/ProgramModuleNav.tsx",
  legacy: "apps/frontend/src/pages/program/LegacyAuditScoreboardPage.tsx",
  reportsHome: "apps/frontend/src/pages/reports/ReportsHome.tsx",
  reportCategories: "apps/frontend/src/components/reports/CategoryHoverNav.tsx",
  runnerConfig: "apps/frontend/src/pages/reports/runners/runner-config.ts",
  reportLaneModal: "apps/frontend/src/components/reports/LaneDetailModal.tsx",
  reportScheduleModal: "apps/frontend/src/pages/reports/ScheduleReportModal.tsx",
  reportFlyout: "apps/frontend/src/components/reports/ReportFlyoutPanel.tsx",
  scheduledPanel: "apps/frontend/src/pages/reports/ScheduledReportsPanel.tsx",
  balanceSheet: "apps/frontend/src/pages/reports/BalanceSheetPage.tsx",
  routes: "apps/frontend/src/routes/manifest.tsx",
  cashFlowMatrix: "docs/specs/scoreboard/modules/cash-flow.required.json",
  fuelMatrix: "docs/specs/scoreboard/modules/fuel.required.json",
  homeMatrix: "docs/specs/scoreboard/modules/home.required.json",
  programMatrix: "docs/specs/scoreboard/modules/program.required.json",
  reportsMatrix: "docs/specs/scoreboard/modules/reports.required.json",
};

const REPORT_IDS = ["management", "ifta", "ifta_preparer", "ar_aging", "ap_aging", "trial_balance", "profit_loss", "balance_sheet", "cash_flow_statement", "cash_flow", "per_truck_cpm", "cash_flow_overview", "settlement_summary", "profit_per_truck", "cancellations", "late_arrival", "fuel_reconciliation", "maintenance_cost_per_unit", "dispatch_margin", "geofence_dwell", "booking_gap", "deadhead", "scheduled", "scheduled_custom"];
const REPORT_ROUTES = ["management", "ifta", "ifta-preparer", "ar-aging", "ap-aging", "trial-balance", "profit-loss", "balance-sheet", "cash-flow-statement", "cash-flow", "per-truck-cpm", "cash-flow-overview", "settlement-summary", "profit-per-truck", "cancellations", "late-arrival", "fuel-reconciliation", "maintenance-cost-per-unit", "dispatch-margin", "geofence-dwell", "booking-gap", "deadhead", "scheduled", "scheduled-custom"];
const RUNNER_IDS = ["profit-truck-mtd", "dispatch-board", "detention-claims", "cash-position", "driver-pay-history", "driver-settlement", "fleet-utilization", "fuel-savings", "fuel-price-variance", "csa-fleet", "hos-violations", "ifta-quarterly", "dot-audit-pack", "saved-owner-pack", "saved-quarter-close", "maint-cost-unit"];
const AUDIT_IDS = ["activity_by_user", "activity_by_module", "financial_change_log", "maintenance_decision_log", "deduction_trail", "void_reversal", "period_close_history"];
const AUDIT_ROUTES = ["activity-by-user", "activity-by-module", "financial-change-log", "maintenance-decision-log", "deduction-trail", "void-reversal", "period-close-history"];

const REQUIRED_LEAVES = {
  cashFlowMatrix: ["home", "tab.actual_vs_projected", "tab.manual_daily_projections", "create.manual_projection"],
  fuelMatrix: ["card_overage"],
  homeMatrix: ["route.root", "route.home", "route.home_ops", "role.owner", "role.dispatcher", "role.accountant", "role.safety", "role.manager", "role.default", "surface.qbo_style", "surface.kpi_cards", "surface.attention_list", "surface.quick_actions", "surface.fleet_restore", "home.panel.accounting_pending_approvals", "home.panel.dispatcher_active_loads", "home.panel.dispatcher_pending_actions", "home.panel.driver_manager_attention", "home.panel.fleet_snapshot", "home.panel.safety_alerts"],
  programMatrix: ["matrix.module_pill", "matrix.request_time_feed", "matrix.live_api", "legacy.board", "scenario.redirect", "hop.audit_coverage", "program.parity.legacy_audit_scoreboard_page"],
  reportsMatrix: ["home.kpi_strip", ...REPORT_IDS.map((id) => `report.${id}`), ...RUNNER_IDS.map((id) => `runner.${id.replaceAll("-", "_")}`), ...AUDIT_IDS.map((id) => `audit.${id}`), "reports.modal.lane_detail", "reports.modal.schedule_report", "reports.panel.report_flyout", "reports.panel.scheduled_reports", "reports.sheet.balance_sheet_page", "reports.flyout.report_flyout"],
};

const read = () => Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

export function verify(source) {
  const failures = [];
  const need = (key, token, message) => { if (!source[key].includes(token)) failures.push(message); };

  need("cashFlow", 'data-testid="cash-flow-page"', "cash-flow home must remain rendered");
  for (const id of ["actual_vs_projected", "manual_daily_projections"]) need("cashFlow", `id: "${id}"`, `cash-flow tab ${id} must remain wired`);
  need("cashFlow", "<ManualDailyProjectionsTab", "cash-flow manual creator surface must remain mounted behind its flag");
  need("cashManual", "createForecastEntry", "manual projection create must retain its canonical mutation");
  need("routes", 'path="/cash-flow"', "cash-flow route must remain mounted");
  need("fuelCard", 'data-testid="fuel-card-overage-queue"', "fuel card-overage queue must remain rendered");
  need("routes", 'path="/fuel/card-overage"', "fuel card-overage route must remain mounted");

  for (const [role, component] of [["Owner", "OwnerHome"], ["Dispatcher", "DispatcherHome"], ["Accountant", "AccountingHome"], ["Safety", "SafetyHome"], ["Manager", "DriverManagerHome"]]) {
    need("home", `case "${role}"`, `home role ${role} must remain routed`);
    need("home", `<${component} auth={auth} />`, `home role ${role} must render ${component}`);
  }
  need("home", "<DefaultHome auth={auth} />", "home must retain its default role surface");
  for (const route of ["/", "/home", "/home/ops", "/app/homepage"]) need("routes", `path="${route}"`, `home route ${route} must remain mounted`);
  for (const token of ["<HomeKpiCard", "<AttentionList", "<QuickActionsBar", "<HomeFleetRestoreCard", "<FleetSnapshotPanel"]) need("ownerHome", token, `owner home must retain ${token}`);
  need("defaultHome", "<HomeKpiCard", "default home must retain KPI cards");
  need("dispatcherHome", "<DispatcherActiveLoadsPanel", "dispatcher home must retain active loads");
  need("dispatcherHome", "<DispatcherPendingActionsPanel", "dispatcher home must retain pending actions");
  need("accountingHome", "<AccountingPendingApprovalsPanel", "accounting home must retain pending approvals");
  need("safetyHome", "<SafetyAlertsPanel", "safety home must retain safety alerts");
  need("managerHome", "<DriverManagerAttentionPanel", "manager home must retain driver attention");
  need("qboHome", "export function QboStyleHomePage", "archived QBO-style home surface must remain mounted without QBO writes");

  need("matrix", 'data-testid={`module-matrix-pill-${m.id}`}', "program matrix must retain module pills");
  need("matrix", 'data-testid="module-matrix-live-banner"', "program matrix must retain live API state");
  need("matrix", "module-matrix-last-refresh", "program matrix must retain request-time feed timestamp");
  need("tracker", 'href="/program/legacy-board"', "program tracker must retain legacy board door");
  need("programNav", 'to="/program/legacy-scoreboard"', "program navigation must retain audit-coverage board door");
  need("legacy", 'data-testid="program-scoreboard-module-table"', "legacy audit scoreboard must remain rendered");
  for (const route of ["/program/matrix", "/program/legacy-board", "/program/legacy-scoreboard"]) need("routes", `path="${route}"`, `program route ${route} must remain mounted`);
  need("routes", '<Route path="/home/scenario-tracker" element={<Navigate to="/program" replace />} />', "scenario legacy route must redirect to Program home");

  need("reportsHome", "reportsKpis.map", "reports home must retain KPI strip");
  for (let i = 0; i < REPORT_ROUTES.length; i += 1) need("routes", `path="/reports/${REPORT_ROUTES[i]}"`, `report route ${REPORT_IDS[i]} must remain mounted`);
  for (const id of RUNNER_IDS.filter((runnerId) => runnerId !== "maint-cost-unit")) need("reportCategories", `id: "${id}"`, `runner ${id} must remain discoverable in report categories`);
  need("runnerConfig", '"maint-cost-unit": {', "maintenance-cost runner must remain registered");
  need("routes", 'path="/reports/run/:reportId"', "generic report runner route must remain mounted");
  for (let i = 0; i < AUDIT_ROUTES.length; i += 1) need("routes", `path="/reports/audit/${AUDIT_ROUTES[i]}"`, `audit report ${AUDIT_IDS[i]} must remain mounted`);
  need("reportLaneModal", "export function LaneDetailModal", "lane detail modal must remain implemented");
  need("reportScheduleModal", "export function ScheduleReportModal", "schedule report modal must remain implemented");
  need("reportFlyout", "export function ReportFlyoutPanel", "report flyout panel must remain implemented");
  need("scheduledPanel", "export function ScheduledReportsPanel", "scheduled reports panel must remain implemented");
  need("balanceSheet", "export function BalanceSheetPage", "balance sheet surface must remain implemented");

  for (const [key, ids] of Object.entries(REQUIRED_LEAVES)) {
    let matrix;
    try { matrix = JSON.parse(source[key]); } catch (error) { failures.push(`${key} must parse: ${error.message}`); continue; }
    for (const id of ids) {
      const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
      if (!leaf?.required?.includes("connectivity")) failures.push(`${key}:${id} must inventory connectivity`);
    }
  }
  return failures;
}

const source = read();
const failures = verify(source);
if (failures.length) {
  console.error("analytical dashboard surface connectivity guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

if (process.argv.includes("--self-test")) {
  const mutations = [
    ["cashFlow", 'data-testid="cash-flow-page"', 'data-testid="broken"'], ["cashManual", "createForecastEntry", "brokenProjection"],
    ["fuelCard", 'data-testid="fuel-card-overage-queue"', 'data-testid="broken"'], ["home", 'case "Owner"', 'case "BrokenOwner"'],
    ["home", "<DefaultHome auth={auth} />", "<div />"], ["ownerHome", "<QuickActionsBar", "<BrokenActions"],
    ["dispatcherHome", "<DispatcherActiveLoadsPanel", "<BrokenLoads"], ["accountingHome", "<AccountingPendingApprovalsPanel", "<BrokenApprovals"],
    ["safetyHome", "<SafetyAlertsPanel", "<BrokenAlerts"], ["managerHome", "<DriverManagerAttentionPanel", "<BrokenAttention"],
    ["qboHome", "export function QboStyleHomePage", "function BrokenHome"], ["matrix", 'data-testid={`module-matrix-pill-${m.id}`}', 'data-testid="broken-pill"'],
    ["matrix", 'data-testid="module-matrix-live-banner"', 'data-testid="broken-live"'], ["tracker", 'href="/program/legacy-board"', 'href="/broken"'],
    ["programNav", 'to="/program/legacy-scoreboard"', 'to="/broken"'], ["legacy", 'data-testid="program-scoreboard-module-table"', 'data-testid="broken"'],
    ["reportsHome", "reportsKpis.map", "[].map"], ["reportCategories", 'id: "profit-truck-mtd"', 'id: "broken-runner"'], ["runnerConfig", '"maint-cost-unit": {', '"broken-runner": {'],
    ["reportLaneModal", "export function LaneDetailModal", "function BrokenLaneModal"], ["reportScheduleModal", "export function ScheduleReportModal", "function BrokenScheduleModal"],
    ["reportFlyout", "export function ReportFlyoutPanel", "function BrokenFlyout"], ["scheduledPanel", "export function ScheduledReportsPanel", "function BrokenScheduledPanel"],
    ["balanceSheet", "export function BalanceSheetPage", "function BrokenBalanceSheet"], ["routes", 'path="/cash-flow"', 'path="/broken-cash-flow"'],
    ["routes", 'path="/fuel/card-overage"', 'path="/broken-fuel"'], ["routes", 'path="/home/ops"', 'path="/broken-home"'],
    ["routes", 'path="/program/matrix"', 'path="/broken-program"'], ["routes", 'path="/reports/profit-loss"', 'path="/broken-report"'],
    ["routes", 'path="/reports/run/:reportId"', 'path="/broken-runner"'], ["routes", 'path="/reports/audit/activity-by-user"', 'path="/broken-audit"'],
    ["cashFlowMatrix", '"id": "home"', '"id": "broken.home"'], ["fuelMatrix", '"id": "card_overage"', '"id": "broken.card"'],
    ["homeMatrix", '"id": "role.owner"', '"id": "broken.owner"'], ["programMatrix", '"id": "matrix.module_pill"', '"id": "broken.matrix"'],
    ["reportsMatrix", '"id": "report.management"', '"id": "broken.report"'],
  ];
  for (const [key, before, after] of mutations) {
    if (!source[key].includes(before)) throw new Error(`self-test fixture missing: ${key} ${before}`);
    if (!verify({ ...source, [key]: source[key].replaceAll(before, after) }).length) throw new Error(`self-test mutation survived: ${key}`);
  }
  console.log(`PASS: ${mutations.length} planted analytical-dashboard defects were rejected`);
}

console.log("PASS: 86 exact analytical/dashboard surfaces remain mounted and connected");
