#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","banking","cash-flow","compliance","customers","dispatch","docs","driver-hub","drivers","factoring","finance","fleet","form_425","fuel","home","insurance","inventory","legal","lists","maintenance","program","reports","safety","settlements","system","tasks","users","vendors"],"cols":["connectivity"],"leafRe":"^chrome\\.toolbar_gear$","task":"CLS-LIST-TOOLBAR-GEAR-APPLY","vertical":"class-sweep"} */
import fs from "node:fs";
import process from "node:process";

const CORE = {
  columnChooser: "apps/frontend/src/components/table/ColumnChooser.tsx",
  dataTable: "apps/frontend/src/components/DataTable.tsx",
  listViewGear: "apps/frontend/src/components/lists/ListView/components/ListViewGear.tsx",
  parityTable: "apps/frontend/src/components/parity/ParityTable.tsx",
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

const HELP_MATRIX = "docs/specs/scoreboard/modules/help.required.json";
const HELP_IDS = ["chrome.toolbar_search", "chrome.toolbar_range", "chrome.toolbar_gear", "chrome.toolbar_filter"];

function read() {
  const files = new Set([...Object.values(CORE), ...Object.values(EVIDENCE).map(([file]) => file), HELP_MATRIX]);
  for (const module of Object.keys(EVIDENCE)) files.add(`docs/specs/scoreboard/modules/${module}.required.json`);
  return Object.fromEntries([...files].map((file) => [file, fs.readFileSync(file, "utf8")]));
}

export function verify(source) {
  const failures = [];
  const need = (file, token, message) => { if (!source[file]?.includes(token)) failures.push(message); };

  for (const token of ["draftHidden", "draftPageSize", "onClick={reset}", "onClick={cancel}", "onClick={apply}"]) {
    need(CORE.columnChooser, token, `ColumnChooser must retain ${token}`);
  }
  need(CORE.dataTable, "<ColumnChooser", "DataTable must expose the governed column gear");
  need(CORE.dataTable, "visibleColumns.map", "DataTable must render the applied visible-column set");
  for (const token of ["const [draft, setDraft]", "onGearChange(draft)", "onClick={reset}", "onClick={cancel}", "onClick={apply}"]) {
    need(CORE.listViewGear, token, `ListViewGear must retain ${token}`);
  }
  for (const token of ["draftHidden", "draftDensity", "applyGear", "cancelGear", "resetGear", "onClick={applyGear}"]) {
    need(CORE.parityTable, token, `ParityTable must retain ${token}`);
  }

  for (const [module, [file, token]] of Object.entries(EVIDENCE)) {
    need(file, token, `${module} must retain production list evidence ${token} in ${file}`);
    let matrix;
    try { matrix = JSON.parse(source[`docs/specs/scoreboard/modules/${module}.required.json`]); }
    catch (error) { failures.push(`${module} matrix must parse: ${error.message}`); continue; }
    const leaf = matrix.leaves?.find((candidate) => candidate.id === "chrome.toolbar_gear");
    if (!leaf?.required?.includes("connectivity")) failures.push(`${module}:chrome.toolbar_gear must require connectivity`);
  }

  let help;
  try { help = JSON.parse(source[HELP_MATRIX]); }
  catch (error) { failures.push(`help matrix must parse: ${error.message}`); return failures; }
  for (const id of HELP_IDS) {
    const leaf = help.leaves?.find((candidate) => candidate.id === id);
    if (!leaf || leaf.required?.includes("connectivity") || !String(leaf.note ?? "").startsWith("N/A:")) {
      failures.push(`help:${id} must remain explicit N/A because Help has no data pipeline list`);
    }
  }
  return failures;
}

const source = read();
const failures = verify(source);
if (failures.length) {
  console.error(`all-module list-toolbar gear guard failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--self-test")) {
  const mutations = [];
  for (const [file, token] of [
    [CORE.columnChooser, "draftHidden"], [CORE.columnChooser, "onClick={apply}"],
    [CORE.dataTable, "<ColumnChooser"], [CORE.dataTable, "visibleColumns.map"],
    [CORE.listViewGear, "const [draft, setDraft]"], [CORE.listViewGear, "onGearChange(draft)"],
    [CORE.parityTable, "draftHidden"], [CORE.parityTable, "onClick={applyGear}"],
  ]) mutations.push(() => ({ ...source, [file]: source[file].replaceAll(token, "BROKEN_GEAR_CONTRACT") }));
  for (const module of Object.keys(EVIDENCE)) {
    const file = `docs/specs/scoreboard/modules/${module}.required.json`;
    mutations.push(() => ({ ...source, [file]: source[file].replace('"id": "chrome.toolbar_gear"', '"id": "broken.toolbar_gear"') }));
  }
  mutations.push(() => ({ ...source, [HELP_MATRIX]: source[HELP_MATRIX].replace('"id": "chrome.toolbar_gear",', '"id": "chrome.toolbar_gear",').replace('"required": [],\n      "note": "N/A: Help has no configurable data-table columns."', '"required": ["connectivity"],\n      "note": "BROKEN"') }));
  mutations.forEach((mutate, index) => {
    if (!verify(mutate()).length) throw new Error(`self-test mutation ${index + 1} survived`);
  });
  console.log(`PASS: ${mutations.length} planted list-toolbar gear defects were rejected`);
}

console.log("PASS: 28 applicable modules inherit draft-to-Apply gear; Help remains explicit N/A");
