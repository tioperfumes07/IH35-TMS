#!/usr/bin/env node
/** @matrix-built {"modules":["compliance","insurance","inventory","legal","maintenance","tasks","driver-hub"],"cols":["connectivity"],"leafRe":"^(overview\\.(summary_cards|credentials_table|notification_rules|notification_log)|fleet\\.hos_board|property_tax\\.(list|detail)|form2290|landing|policies\\.detail|type_catalog\\.list|coverage_gaps|nav\\.(parts_tab|assignments_tab|purchases_tab)|assignments\\.(banner|trail|search|wo_link|unit_link|vendor_link|crosslink_parts|crosslink_purchases|honest_empty)|contracts\\.list|templates\\.(list|detail)|policies|attorney_review|reports|damage_reports\\.intake|road_service\\.active|defects\\.convert_to_wo|pre_flight_dvir\\.queue|fault_drafts\\.review|board\\.planner_grid|mine\\.list|chat\\.mentions|inbox)$","task":"LINK-F5157-OPERATOR-RECORD-SURFACE-CONNECTIVITY","vertical":"class-sweep"} */
/** @matrix-built {"modules":["users"],"cols":["connectivity"],"leaves":["list","detail","create","role_change","deactivate","tab.all","kpi","detail.drawer.dispatcher_safety_event","chrome.toolbar_search","chrome.toolbar_range","chrome.toolbar_gear","chrome.toolbar_filter"],"task":"USR-F5901-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";
import process from "node:process";

const FILES = {
  compliance: "apps/frontend/src/pages/compliance/ComplianceDashboardPage.tsx",
  propertyTax: "apps/frontend/src/pages/compliance/PropertyTaxRenditionPage.tsx",
  form2290: "apps/frontend/src/pages/compliance/Form2290Filings.tsx",
  filings: "apps/backend/src/compliance/filings-aggregate.service.ts",
  insurance: "apps/frontend/src/pages/safety/tabs/InsuranceTab.tsx",
  insuranceLanding: "apps/frontend/src/pages/insurance/InsuranceLanding.tsx",
  insurancePolicy: "apps/frontend/src/pages/insurance/PolicyDetail.tsx",
  insuranceTypes: "apps/frontend/src/pages/insurance/TypeCatalogAdmin.tsx",
  insuranceGaps: "apps/frontend/src/pages/insurance/CoverageGapDashboard.tsx",
  inventoryTabs: "apps/frontend/src/pages/inventory/InventoryModuleTabs.tsx",
  inventoryAssignments: "apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx",
  inventoryPurchases: "apps/frontend/src/pages/inventory/InventoryPurchasesPage.tsx",
  legalTabs: "apps/frontend/src/pages/legal/LegalModuleTabs.tsx",
  legalLanding: "apps/frontend/src/pages/legal/LegalLandingPage.tsx",
  legalTemplates: "apps/frontend/src/pages/legal/templates/LegalTemplatesListPage.tsx",
  legalTemplateDetail: "apps/frontend/src/pages/legal/templates/LegalTemplateDetailPage.tsx",
  legalPolicies: "apps/frontend/src/pages/legal/LegalPoliciesPage.tsx",
  legalAttorney: "apps/frontend/src/pages/legal/LegalAttorneyReviewPage.tsx",
  legalReports: "apps/frontend/src/pages/legal/reports/LegalReportsLandingPage.tsx",
  maintDamage: "apps/frontend/src/pages/maintenance/components/MaintenanceDamageRegisterTab.tsx",
  maintRoad: "apps/frontend/src/pages/maintenance/RoadServiceList.tsx",
  maintDefects: "apps/frontend/src/pages/maintenance/DefectsInboxPage.tsx",
  maintPreflight: "apps/frontend/src/pages/maintenance/pre-flight/PreFlightDvirQueue.tsx",
  maintFaults: "apps/frontend/src/pages/maintenance/FaultDraftsPage.tsx",
  tasksBoard: "apps/frontend/src/pages/tasks/TaskBoardPage.tsx",
  tasksMine: "apps/frontend/src/pages/tasks/TasksMinePage.tsx",
  tasksChat: "apps/frontend/src/pages/tasks/TasksChatPage.tsx",
  users: "apps/frontend/src/pages/Users.tsx",
  userDetail: "apps/frontend/src/pages/UserDetail.tsx",
  driverInbox: "apps/frontend/src/components/driver-inbox/DriverInbox.tsx",
  routes: "apps/frontend/src/routes/manifest.tsx",
  complianceMatrix: "docs/specs/scoreboard/modules/compliance.required.json",
  insuranceMatrix: "docs/specs/scoreboard/modules/insurance.required.json",
  inventoryMatrix: "docs/specs/scoreboard/modules/inventory.required.json",
  legalMatrix: "docs/specs/scoreboard/modules/legal.required.json",
  maintenanceMatrix: "docs/specs/scoreboard/modules/maintenance.required.json",
  tasksMatrix: "docs/specs/scoreboard/modules/tasks.required.json",
  usersMatrix: "docs/specs/scoreboard/modules/users.required.json",
  driverHubMatrix: "docs/specs/scoreboard/modules/driver-hub.required.json",
  feed: "docs/specs/scoreboard/wire-sprint-built.json",
  self: "scripts/verify-operator-record-surface-connectivity.mjs",
};
const USERS_HEADER = '/** @matrix-built {"modules":["users"],"cols":["connectivity"],"leaves":["list","detail","create","role_change","deactivate","tab.all","kpi","detail.drawer.dispatcher_safety_event","chrome.toolbar_search","chrome.toolbar_range","chrome.toolbar_gear","chrome.toolbar_filter"],"task":"USR-F5901-CONNECTIVITY-EXACT","vertical":"class-sweep"} */';

const REQUIRED_LEAVES = {
  complianceMatrix: ["overview.summary_cards", "overview.credentials_table", "overview.notification_rules", "overview.notification_log", "fleet.hos_board", "property_tax.list", "property_tax.detail", "form2290"],
  insuranceMatrix: ["landing", "policies.detail", "type_catalog.list", "coverage_gaps"],
  inventoryMatrix: ["nav.parts_tab", "nav.assignments_tab", "nav.purchases_tab", "assignments.trail", "assignments.wo_link", "assignments.unit_link", "assignments.vendor_link", "assignments.honest_empty"],
  legalMatrix: ["landing", "contracts.list", "templates.list", "templates.detail", "policies", "attorney_review", "reports"],
  maintenanceMatrix: ["damage_reports.intake", "road_service.active", "defects.convert_to_wo", "pre_flight_dvir.queue", "fault_drafts.review"],
  tasksMatrix: ["board.planner_grid", "mine.list", "chat.mentions"],
  usersMatrix: ["list", "detail", "create", "role_change", "deactivate", "tab.all", "kpi", "detail.drawer.dispatcher_safety_event", "chrome.toolbar_search", "chrome.toolbar_range", "chrome.toolbar_gear", "chrome.toolbar_filter"],
  driverHubMatrix: ["inbox"],
};

const read = () => Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

export function verify(source) {
  const failures = [];
  const need = (key, token, message) => { if (!source[key].includes(token)) failures.push(message); };

  for (const token of ["<SummaryCards", "<ComplianceTable", "<NotificationRulesPanel", "<NotificationLogPanel", "<FleetHosBoardSection"]) need("compliance", token, `compliance must render ${token}`);
  need("propertyTax", 'data-testid="property-tax-list"', "property-tax list must remain rendered");
  need("propertyTax", 'data-testid="property-tax-detail"', "property-tax detail must remain rendered");
  need("form2290", "export function Form2290Filings", "Form 2290 operator surface must remain implemented");
  need("filings", 'drill_through: "/compliance/form-2290"', "Form 2290 aggregate row must drill into its canonical surface");
  for (const route of ["/compliance", "/compliance/property-tax", "/compliance/property-tax/:id", "/compliance/form-2290"]) need("routes", `path="${route}"`, `compliance route ${route} must remain mounted`);

  for (const route of ["/safety/insurance", "/safety/insurance/policies", "/safety/insurance/type-catalog", "/safety/insurance/coverage-gaps"]) need("insurance", `to="${route}"`, `insurance navigation must expose ${route}`);
  need("insuranceLanding", "InsuranceLanding", "insurance landing must remain implemented");
  need("insurancePolicy", "PolicyDetail", "insurance policy detail must remain implemented");
  need("insuranceTypes", "<ParityTable", "insurance type catalog must render its canonical list");
  need("insuranceGaps", "Coverage Gap Dashboard", "insurance coverage gaps must remain rendered");

  for (const route of ["/inventory", "/inventory/assignments", "/inventory/purchases"]) need("inventoryTabs", `to: "${route}"`, `inventory navigation must expose ${route}`);
  // LV-INVENTORY-ASSIGNMENTS-DUPLICATE-SEARCH (Cursor, 2026-08-15): the page-local search input
  // was removed in favor of ParityTable's own canonical Search+Range+gear toolbar — the literal
  // placeholder assertion this used to check is now permanently gone by design, not a regression.
  for (const token of ["getPartsAssignmentsPage", 'kind="work_order"', 'kind="unit"', 'kind="vendor"', "canonical ParityTable UniversalListToolbar", 'to="/inventory"', 'to="/inventory/purchases"']) need("inventoryAssignments", token, `inventory assignments must retain ${token}`);
  // INV-PURCHASE-LEDGER-SOR-STOCK-UPSERT (owner-approved 2026-08-15): the honest-empty placeholder
  // is superseded by the real append-only SoR — assert the real list load instead.
  need("inventoryPurchases", "listPartsPurchases", "inventory purchases must load the real append-only SoR via listPartsPurchases");
  for (const route of ["/inventory", "/inventory/assignments", "/inventory/purchases"]) need("routes", `path="${route}"`, `inventory route ${route} must remain mounted`);

  for (const [id, route] of [["contracts", "/legal/contracts"], ["templates", "/legal/templates"], ["policies", "/legal/policies"], ["attorney-review", "/legal/attorney-review"], ["reports", "/legal/reports"]]) need("legalTabs", `{ id: "${id}", label:`, `legal tab ${id} must remain visible`), need("legalTabs", `to: "${route}"`, `legal tab ${id} must retain its destination`);
  for (const [key, token] of [["legalLanding", '<LegalModuleTabs activeTabId="contracts"'], ["legalTemplates", '<LegalModuleTabs activeTabId="templates"'], ["legalTemplateDetail", 'data-testid="legal-template-detail-page"'], ["legalPolicies", '<LegalModuleTabs activeTabId="policies"'], ["legalAttorney", '<LegalModuleTabs activeTabId="attorney-review"'], ["legalReports", '<LegalModuleTabs activeTabId="reports"']]) need(key, token, `${key} must remain connected to legal navigation`);
  for (const route of ["/legal", "/legal/contracts", "/legal/templates", "/legal/templates/:id", "/legal/policies", "/legal/attorney-review", "/legal/reports"]) need("routes", `path="${route}"`, `legal route ${route} must remain mounted`);

  need("maintDamage", "MaintenanceDamageRegisterTab", "maintenance damage intake must remain implemented");
  need("maintRoad", 'data-testid="road-service-list"', "road-service active list must remain rendered");
  need("maintDefects", 'data-testid="maint-dvir-defects-inbox"', "defect triage queue must remain rendered");
  need("maintPreflight", 'data-testid="pre-flight-dvir-queue"', "pre-flight DVIR queue must remain rendered");
  need("maintFaults", "<ParityTable", "fault-draft review must remain rendered");
  for (const route of ["/maintenance/damage-reports", "/maintenance/road-service", "/maintenance/defects", "/maintenance/pre-flight-dvir", "/maintenance/fault-drafts"]) need("routes", `path="${route}"`, `maintenance route ${route} must remain mounted`);

  need("tasksBoard", "<TaskPlannerGrid />", "task board must retain planner grid");
  need("tasksMine", "<ParityTable", "My Tasks must retain its canonical list");
  need("tasksChat", 'data-testid="tasks-chat-mention"', "task chat must retain mention rendering");
  for (const route of ["/tasks", "/tasks/mine", "/tasks/chat"]) need("routes", `path="${route}"`, `tasks route ${route} must remain mounted`);

  for (const token of ["<ParityTable<IdentityUser>", 'data-testid="user-roster-record-link"', "createUserMutation", "roleWorkflowMutation", "deactivateMutation", "<SecondaryNavTabs", "<KpiCard"]) need("users", token, `users surface must retain ${token}`);
  for (const token of ['filterBar={', '<CollapsedListFilters', 'storageKey="users-list"']) need("users", token, `users shared toolbar must retain ${token}`);
  need("userDetail", 'title="Create Dispatcher Safety Event"', "user detail must mount dispatcher safety event drawer");
  for (const route of ["/users", "/users/:id"]) need("routes", `path="${route}"`, `users route ${route} must remain mounted`);
  need("driverInbox", "export function DriverInbox", "Driver Hub inbox must remain implemented");
  need("routes", 'path="/driver-hub"', "Driver Hub route must remain mounted");

  for (const [key, ids] of Object.entries(REQUIRED_LEAVES)) {
    let matrix;
    try { matrix = JSON.parse(source[key]); } catch (error) { failures.push(`${key} must parse: ${error.message}`); continue; }
    for (const id of ids) {
      const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
      if (!leaf?.required?.includes("connectivity")) failures.push(`${key}:${id} must inventory connectivity`);
    }
  }
  if (!source.self.split('import fs from "node:fs";')[0].includes(USERS_HEADER)) failures.push("exact 12-leaf Users connectivity header missing");
  try { if (JSON.parse(source.feed).entries?.some((entry) => entry.guard === FILES.self)) failures.push("manual feed duplicates exact Users ownership"); }
  catch (error) { failures.push(`feed parse: ${error.message}`); }
  return failures;
}

const source = read();
const failures = verify(source);
if (failures.length) {
  console.error("operator record surface connectivity guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

if (process.argv.includes("--self-test")) {
  const mutations = [
    ["compliance", "<SummaryCards", "<BrokenSummary"], ["propertyTax", 'data-testid="property-tax-list"', 'data-testid="broken"'],
    ["form2290", "export function Form2290Filings", "function Broken2290"], ["filings", 'drill_through: "/compliance/form-2290"', 'drill_through: "/safety/permits"'],
    ["insurance", 'to="/safety/insurance/policies"', 'to="/broken"'], ["insuranceTypes", "<ParityTable", "<BrokenTable"],
    ["inventoryTabs", 'to: "/inventory/assignments"', 'to: "/broken"'], ["inventoryAssignments", "getPartsAssignmentsPage", "brokenAssignmentsPage"],
    ["inventoryAssignments", 'kind="work_order"', 'kind="broken"'],
    ["inventoryAssignments", 'to="/inventory/purchases"', 'to="/broken"'], ["inventoryPurchases", "listPartsPurchases", "brokenPartsPurchases"],
    ["legalTabs", 'to: "/legal/contracts"', 'to: "/broken"'], ["legalTemplateDetail", 'data-testid="legal-template-detail-page"', 'data-testid="broken"'],
    ["maintRoad", 'data-testid="road-service-list"', 'data-testid="broken"'], ["maintDefects", 'data-testid="maint-dvir-defects-inbox"', 'data-testid="broken"'],
    ["maintPreflight", 'data-testid="pre-flight-dvir-queue"', 'data-testid="broken"'], ["tasksBoard", "<TaskPlannerGrid />", "<div />"],
    ["tasksMine", "<ParityTable", "<BrokenTable"], ["tasksChat", 'data-testid="tasks-chat-mention"', 'data-testid="broken"'],
    ["users", "<ParityTable<IdentityUser>", "<BrokenTable"], ["users", "roleWorkflowMutation", "brokenRoleWorkflow"],
    ["users", "<CollapsedListFilters", "<BrokenFilters"], ["userDetail", 'title="Create Dispatcher Safety Event"', 'title="Broken"'],
    ["driverInbox", "export function DriverInbox", "function BrokenInbox"], ["routes", 'path="/compliance/form-2290"', 'path="/broken-2290"'],
    ["routes", 'path="/inventory/assignments"', 'path="/broken-inventory"'], ["routes", 'path="/maintenance/defects"', 'path="/broken-maintenance"'],
    ["complianceMatrix", '"id": "form2290"', '"id": "broken.form2290"'], ["insuranceMatrix", '"id": "landing"', '"id": "broken.landing"'],
    ["inventoryMatrix", '"id": "assignments.trail"', '"id": "broken.trail"'], ["legalMatrix", '"id": "contracts.list"', '"id": "broken.contracts"'],
    ["maintenanceMatrix", '"id": "defects.convert_to_wo"', '"id": "broken.defects"'], ["tasksMatrix", '"id": "board.planner_grid"', '"id": "broken.board"'],
    ["usersMatrix", '"id": "list"', '"id": "broken.list"'], ["driverHubMatrix", '"id": "inbox"', '"id": "broken.inbox"'],
    ["self", USERS_HEADER, USERS_HEADER.replace('"vertical":"class-sweep"', '"vertical":"broken"')],
    ["feed", '"entries": [', `"entries": [{"guard":"${FILES.self}"},`],
  ];
  for (const [key, before, after] of mutations) {
    if (!source[key].includes(before)) throw new Error(`self-test fixture missing: ${key} ${before}`);
    if (!verify({ ...source, [key]: source[key].replaceAll(before, after) }).length) throw new Error(`self-test mutation survived: ${key}`);
  }
  console.log(`PASS: ${mutations.length} planted operator-surface defects were rejected`);
}

console.log("PASS: 47 exact operator record surfaces remain mounted and connected");
