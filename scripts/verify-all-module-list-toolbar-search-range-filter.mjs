#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","banking","cash-flow","compliance","customers","dispatch","docs","driver-hub","drivers","factoring","finance","fleet","form_425","fuel","home","insurance","inventory","legal","lists","maintenance","program","reports","safety","settlements","system","tasks","users","vendors"],"cols":["connectivity"],"leafRe":"^chrome\\.toolbar_(search|range)$","task":"CLS-LIST-TOOLBAR-SEARCH-RANGE-FILTER","vertical":"class-sweep"} */
/** @matrix-built {"modules":["banking","cash-flow","driver-hub","finance","home","program","system","users"],"cols":["connectivity"],"leafRe":"^chrome\\.toolbar_filter$","task":"CLS-LIST-TOOLBAR-SEARCH-RANGE-FILTER","vertical":"class-sweep"} */
import fs from "node:fs";
import process from "node:process";

const CORE = {
  toolbar: "apps/frontend/src/components/table/UniversalListToolbar.tsx",
  controls: "apps/frontend/src/components/table/TableControls.tsx",
  controller: "apps/frontend/src/components/table/useTableController.ts",
  dataTable: "apps/frontend/src/components/DataTable.tsx",
  listView: "apps/frontend/src/components/lists/ListView/ListView.tsx",
  parityTable: "apps/frontend/src/components/parity/ParityTable.tsx",
  fleetTable: "apps/frontend/src/components/FleetTable.tsx",
};

const EVIDENCE = {
  accounting: ["apps/frontend/src/pages/accounting/BillsPage.tsx", "<ParityTable"],
  banking: ["apps/frontend/src/pages/banking/CashGlSetupPage.tsx", "<ParityTable"],
  "cash-flow": ["apps/frontend/src/pages/cash-flow/tabs/ActualVsProjectedTab.tsx", "<ParityTable"],
  compliance: ["apps/frontend/src/pages/compliance/HosViewerSection.tsx", "<ParityTable"],
  customers: ["apps/frontend/src/pages/customers/CustomersListView.tsx", "<ParityTable"],
  dispatch: ["apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx", "<ParityTable"],
  docs: ["apps/frontend/src/pages/docs/DocsHomePage.tsx", "<ParityTable"],
  "driver-hub": ["apps/frontend/src/pages/home/DriverHubReportingPage.tsx", "<ParityTable"],
  drivers: ["apps/frontend/src/components/drivers/OperationsHistoryTable.tsx", "<ParityTable"],
  factoring: ["apps/frontend/src/pages/factoring/FactoringHome.tsx", "<ParityTable"],
  finance: ["apps/frontend/src/pages/finance/LoanWizardPage.tsx", "<ParityTable"],
  fleet: ["apps/frontend/src/components/FleetTable.tsx", "<TableControls"],
  form_425: ["apps/frontend/src/pages/form425c/tabs/QBImportTab.tsx", "<ParityTable"],
  fuel: ["apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx", "<ParityTable"],
  home: ["apps/frontend/src/components/home/DriverDaySummaryCard.tsx", "<ParityTable"],
  insurance: ["apps/frontend/src/pages/insurance/LawsuitsTab.tsx", "<ParityTable"],
  inventory: ["apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx", "<ParityTable"],
  legal: ["apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx", "<ParityTable"],
  lists: ["apps/frontend/src/pages/lists/accounting/ChartOfAccountsListPage.tsx", "<ListView"],
  maintenance: ["apps/frontend/src/pages/maintenance/reports/MaintenanceReportsPage.tsx", "<ParityTable"],
  program: ["apps/frontend/src/pages/program/ModuleCompletionPage.tsx", "<ParityTable"],
  reports: ["apps/frontend/src/components/reports/FrequentlyRunTable.tsx", "<ParityTable"],
  safety: ["apps/frontend/src/components/safety/MedicalCardsHistorySection.tsx", "<ParityTable"],
  settlements: ["apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx", "<ParityTable"],
  system: ["apps/frontend/src/pages/system/SystemModulePage.tsx", "<ParityTable"],
  tasks: ["apps/frontend/src/pages/tasks/TasksReportPage.tsx", "<ParityTable"],
  users: ["apps/frontend/src/components/users/UserActivityTab.tsx", "<ParityTable"],
  vendors: ["apps/frontend/src/pages/vendors/VendorsListView.tsx", "<ParityTable"],
};

const FILTER_MODULES = new Set(["banking", "cash-flow", "driver-hub", "finance", "home", "program", "system", "users"]);
const CONNECTIVITY_EXCLUSIONS = {
  form_425: ["tab.qb", "law.virtual_banks_excluded"],
  system: ["tab.qbo_recon", "tab.qbo_sync", "law.no_tms_qbo_writeback"],
};

function read() {
  const files = new Set([...Object.values(CORE), ...Object.values(EVIDENCE).map(([file]) => file)]);
  for (const module of Object.keys(EVIDENCE)) files.add(`docs/specs/scoreboard/modules/${module}.required.json`);
  return Object.fromEntries([...files].map((file) => [file, fs.readFileSync(file, "utf8")]));
}

export function verify(source) {
  const failures = [];
  const need = (file, token, message) => { if (!source[file]?.includes(token)) failures.push(message); };

  for (const token of ["<TableSearch", "<DatePicker", "<MoneyInput", "NUMBER_FIELD", 'aria-label="Range from number"', "applyUniversalListFilters", "onClick={reset}", "onClick={cancel}", "onClick={apply}", 'event.key === "Escape"', 'document.addEventListener("mousedown"']) {
    need(CORE.toolbar, token, `UniversalListToolbar must retain ${token}`);
  }
  for (const file of [CORE.dataTable, CORE.listView, CORE.parityTable]) {
    need(file, "<UniversalListToolbar", `${file} must render UniversalListToolbar`);
    need(file, "applyUniversalListFilters", `${file} must apply toolbar filters to rows`);
  }
  need(CORE.controls, "<UniversalListToolbar", "TableControls must render UniversalListToolbar");
  need(CORE.controller, "applyUniversalListFilters", "useTableController must apply range filtering");
  need(CORE.controller, "setRange", "useTableController must expose applied range state");
  need(CORE.fleetTable, "range={table.range}", "FleetTable must bind shared range state");
  need(CORE.fleetTable, "onRangeApply={table.setRange}", "FleetTable must apply shared range state");

  for (const [module, [file, token]] of Object.entries(EVIDENCE)) {
    need(file, token, `${module} must retain production list evidence ${token} in ${file}`);
    const matrixFile = `docs/specs/scoreboard/modules/${module}.required.json`;
    let matrix;
    try { matrix = JSON.parse(source[matrixFile]); }
    catch (error) { failures.push(`${module} matrix must parse: ${error.message}`); continue; }
    for (const id of ["chrome.toolbar_search", "chrome.toolbar_range", ...(FILTER_MODULES.has(module) ? ["chrome.toolbar_filter"] : [])]) {
      const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
      if (!leaf?.required?.includes("connectivity")) failures.push(`${module}:${id} must require connectivity`);
    }
  }
  for (const [module, ids] of Object.entries(CONNECTIVITY_EXCLUSIONS)) {
    const matrix = JSON.parse(source[`docs/specs/scoreboard/modules/${module}.required.json`]);
    for (const id of ids) {
      const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
      if (!leaf || leaf.required?.includes("connectivity") || !String(leaf.note ?? "").includes("N/A")) {
        failures.push(`${module}:${id} must remain explicit connectivity N/A under the QBO exclusion ruling`);
      }
    }
  }
  return failures;
}

const source = read();
const failures = verify(source);
if (failures.length) {
  console.error(`all-module list-toolbar search/range/filter guard failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--self-test")) {
  const mutations = [];
  for (const [file, token] of [
    [CORE.toolbar, "<TableSearch"], [CORE.toolbar, "<DatePicker"], [CORE.toolbar, "<MoneyInput"], [CORE.toolbar, "NUMBER_FIELD"],
    [CORE.toolbar, "onClick={apply}"], [CORE.toolbar, 'event.key === "Escape"'],
    [CORE.dataTable, "<UniversalListToolbar"], [CORE.dataTable, "applyUniversalListFilters"],
    [CORE.listView, "<UniversalListToolbar"], [CORE.listView, "applyUniversalListFilters"],
    [CORE.parityTable, "<UniversalListToolbar"], [CORE.parityTable, "applyUniversalListFilters"],
    [CORE.controls, "<UniversalListToolbar"], [CORE.controller, "applyUniversalListFilters"],
    [CORE.fleetTable, "range={table.range}"],
  ]) mutations.push(() => ({ ...source, [file]: source[file].replaceAll(token, "BROKEN_TOOLBAR_CONTRACT") }));
  for (const [module, [file, token]] of Object.entries(EVIDENCE)) {
    mutations.push(() => ({ ...source, [file]: source[file].replaceAll(token, "BROKEN_PRODUCTION_CONSUMER") }));
    const matrixFile = `docs/specs/scoreboard/modules/${module}.required.json`;
    mutations.push(() => ({ ...source, [matrixFile]: source[matrixFile].replace('"id": "chrome.toolbar_search"', '"id": "broken.toolbar_search"') }));
  }
  for (const module of FILTER_MODULES) {
    const matrixFile = `docs/specs/scoreboard/modules/${module}.required.json`;
    mutations.push(() => ({ ...source, [matrixFile]: source[matrixFile].replace('"id": "chrome.toolbar_filter"', '"id": "broken.toolbar_filter"') }));
  }
  for (const [module, ids] of Object.entries(CONNECTIVITY_EXCLUSIONS)) {
    const matrixFile = `docs/specs/scoreboard/modules/${module}.required.json`;
    for (const id of ids) {
      mutations.push(() => ({ ...source, [matrixFile]: source[matrixFile].replace(`"id": "${id}"`, `"id": "broken.${id}"`) }));
    }
  }
  mutations.forEach((mutate, index) => {
    if (!verify(mutate()).length) throw new Error(`self-test mutation ${index + 1} survived`);
  });
  console.log(`PASS: ${mutations.length} planted list-toolbar search/range/filter defects were rejected`);
}

console.log("PASS: 28 modules inherit applied search/range and 8 applicable modules inherit applied filter chrome");
