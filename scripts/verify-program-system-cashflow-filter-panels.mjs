#!/usr/bin/env node
/**
 * LV-PROGRAM-MODULES-FILTER-CONTROL-ABSENT
 * LV-SYSTEM-PROGRAM-FILTER-CONTROL-ABSENT
 * LV-CASH-FLOW-ACTUAL-FILTER-PANEL-ABSENT
 * LV-INSURANCE-LAWSUITS-FILTER-PANEL-ABSENT
 * LV-DRIVERS-TABLE-FILTER-PANEL-ABSENT
 * LV-LEGAL-MATTERS-FILTER-LEAF-THEATER
 * LV-TASKS-REPORT-FILTER-PANEL-ABSENT
 * LV-SAFETY-ANOMALIES-FILTER-LEAF-THEATER
 * LV-DOCS-FILTER-LEAF-THEATER
 * LV-REPORTS-FILTER-LEAF-THEATER
 * LV-VENDORS-FILTER-LEAF-THEATER
 * LV-CUSTOMERS-FILTER-LEAF-THEATER
 * LV-LISTS-FILTER-LEAF-THEATER
 * LV-ACCOUNTING-FILTER-LEAF-THEATER
 * LV-FLEET-FILTER-LEAF-THEATER
 * LV-DISPATCH-FILTER-LEAF-THEATER
 * LV-FACTORING-FILTER-LEAF-THEATER
 * LV-MAINTENANCE-FILTER-LEAF-THEATER
 * LV-FUEL-FILTER-PANEL-ABSENT
 * LV-COMPLIANCE-FILTER-PANEL-ABSENT
 * LV-INVENTORY-FILTER-PANEL-ABSENT
 * LV-FORM425-FILTER-PANEL-ABSENT
 * LV-HELP-FILTER-PANEL-ABSENT
 *
 * Exact Live leaves claimed chrome.toolbar_filter but mounted ParityTable without a governed
 * CollapsedListFilters panel + Apply/Cancel/Reset. Date-range Apply on cash-flow is NOT the filter panel.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SURFACES = [
  {
    id: "program",
    file: "apps/frontend/src/pages/program/ModuleCompletionPage.tsx",
    route: "/program/modules",
  },
  {
    id: "system",
    file: "apps/frontend/src/pages/system/SystemModulePage.tsx",
    route: "/system?tab=program",
  },
  {
    id: "cash-flow",
    file: "apps/frontend/src/pages/cash-flow/tabs/ActualVsProjectedTab.tsx",
    route: "/cash-flow?tab=actual_vs_projected",
  },
  {
    id: "insurance-lawsuits",
    file: "apps/frontend/src/pages/insurance/LawsuitsTab.tsx",
    route: "/safety/insurance/lawsuits",
  },
  {
    id: "drivers-table",
    file: "apps/frontend/src/pages/drivers/DriversTable.tsx",
    route: "/drivers",
  },
  {
    id: "legal-matters",
    file: "apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx",
    route: "/legal/matters",
  },
  {
    id: "tasks-report",
    file: "apps/frontend/src/pages/tasks/TasksReportPage.tsx",
    route: "/tasks/report",
  },
  {
    id: "safety-anomalies",
    file: "apps/frontend/src/pages/safety/tabs/AnomaliesTab.tsx",
    route: "/safety/integrity-reports",
  },
  {
    id: "docs-home",
    file: "apps/frontend/src/pages/docs/DocsHomePage.tsx",
    route: "/docs",
  },
  {
    id: "vendors-list",
    file: "apps/frontend/src/pages/vendors/VendorsListView.tsx",
    route: "/vendors",
  },
  {
    id: "customers-list",
    file: "apps/frontend/src/pages/customers/CustomersListView.tsx",
    route: "/customers",
  },
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function collectFailures(sources) {
  const failures = [];
  for (const surface of SURFACES) {
    const src = sources[surface.file] ?? "";
    if (!src.includes("CollapsedListFilters")) {
      failures.push(`${surface.id} (${surface.route}): must mount CollapsedListFilters for chrome.toolbar_filter`);
    }
    if (!/\bonApply=\{/.test(src)) {
      failures.push(`${surface.id}: CollapsedListFilters must wire onApply (no silent apply)`);
    }
    if (!/\bonReset=\{/.test(src)) {
      failures.push(`${surface.id}: CollapsedListFilters must wire onReset`);
    }
    if (!/\bonCancel=\{/.test(src)) {
      failures.push(`${surface.id}: CollapsedListFilters must wire onCancel`);
    }
    if (!src.includes("useStagedListFilters")) {
      failures.push(`${surface.id}: must stage drafts via useStagedListFilters`);
    }
    if (!/<ParityTable[\s\S]*rows=\{/.test(src)) {
      failures.push(`${surface.id}: must retain ParityTable consumer`);
    }
  }
  // Cash-flow: date Apply alone must not be the only Apply — require Filters toggle prefix
  const cash = sources[SURFACES[2].file] ?? "";
  if (!/testIdPrefix="cash-flow-avp"/.test(cash) && !/data-cash-flow-avp-filter-toolbar/.test(cash)) {
    failures.push("cash-flow: Filters panel must be distinct from the date-range Apply control");
  }
  // Insurance: Filters must bind to Lawsuits exact owner (not alias /insurance + UniversalListToolbar)
  const insuranceReq = sources["docs/specs/scoreboard/modules/insurance.required.json"] ?? "";
  if (insuranceReq) {
    if (!/"id": "chrome\.toolbar_filter"[\s\S]*?"route_hint": "\/safety\/insurance\/lawsuits"/.test(insuranceReq)) {
      failures.push("insurance.required.json: chrome.toolbar_filter route_hint must be /safety/insurance/lawsuits");
    }
    if (!/"id": "chrome\.toolbar_filter"[\s\S]*?"surface_path": "pages\/insurance\/LawsuitsTab\.tsx"/.test(insuranceReq)) {
      failures.push("insurance.required.json: chrome.toolbar_filter surface_path must be LawsuitsTab.tsx");
    }
  }
  const lawsuits = sources[SURFACES[3].file] ?? "";
  if (!/testIdPrefix="insurance-lawsuits"/.test(lawsuits) && !/data-insurance-lawsuits-filter-toolbar/.test(lawsuits)) {
    failures.push("insurance-lawsuits: Filters panel must use insurance-lawsuits testId/data attribute");
  }
  const drivers = sources[SURFACES[4].file] ?? "";
  if (!/testIdPrefix="drivers-table"/.test(drivers) && !/data-drivers-table-filter-toolbar/.test(drivers)) {
    failures.push("drivers-table: Filters panel must use drivers-table testId/data attribute");
  }
  const legalReq = sources["docs/specs/scoreboard/modules/legal.required.json"] ?? "";
  if (legalReq) {
    if (!/"id": "chrome\.toolbar_filter"[\s\S]*?"route_hint": "\/legal\/matters"/.test(legalReq)) {
      failures.push("legal.required.json: chrome.toolbar_filter route_hint must be /legal/matters");
    }
    if (!/"id": "chrome\.toolbar_filter"[\s\S]*?"surface_path": "pages\/legal\/matters\/LegalMattersListPage\.tsx"/.test(legalReq)) {
      failures.push("legal.required.json: chrome.toolbar_filter surface_path must be LegalMattersListPage.tsx");
    }
  }
  const legal = sources[SURFACES[5].file] ?? "";
  if (!/testIdPrefix="legal-matters"/.test(legal) && !/data-legal-matters-filter-toolbar/.test(legal)) {
    failures.push("legal-matters: Filters panel must use legal-matters testId/data attribute");
  }

  const tasks = sources[SURFACES[6].file] ?? "";
  if (!/testIdPrefix="tasks-report"/.test(tasks) && !/data-tasks-report-filter-toolbar/.test(tasks)) {
    failures.push("tasks-report: Filters panel must use tasks-report testId/data attribute");
  }
  const tasksReq = sources["docs/specs/scoreboard/modules/tasks.required.json"] ?? "";
  if (tasksReq) {
    if (!/"id": "chrome\.toolbar_filter"[\s\S]*?"surface_path": "pages\/tasks\/TasksReportPage\.tsx"/.test(tasksReq)) {
      failures.push("tasks.required.json: chrome.toolbar_filter surface_path must be TasksReportPage.tsx");
    }
  }
  const safetyReq = sources["docs/specs/scoreboard/modules/safety.required.json"] ?? "";
  if (safetyReq) {
    if (!/"id": "chrome\.toolbar_filter"[\s\S]*?"route_hint": "\/safety\/integrity-reports"/.test(safetyReq)) {
      failures.push("safety.required.json: chrome.toolbar_filter route_hint must be /safety/integrity-reports");
    }
    if (!/"id": "chrome\.toolbar_filter"[\s\S]*?"surface_path": "pages\/safety\/tabs\/AnomaliesTab\.tsx"/.test(safetyReq)) {
      failures.push("safety.required.json: chrome.toolbar_filter surface_path must be AnomaliesTab.tsx");
    }
  }
  const anomalies = sources[SURFACES[7].file] ?? "";
  if (!/testIdPrefix="anomalies"/.test(anomalies) && !/data-anomalies-filter-toolbar/.test(anomalies)) {
    failures.push("safety-anomalies: Filters panel must use anomalies testId/data attribute");
  }
  const docsReq = sources["docs/specs/scoreboard/modules/docs.required.json"] ?? "";
  if (docsReq) {
    if (!/"id": "chrome\.toolbar_filter"[\s\S]*?"surface_path": "pages\/docs\/DocsHomePage\.tsx"/.test(docsReq)) {
      failures.push("docs.required.json: chrome.toolbar_filter surface_path must be DocsHomePage.tsx");
    }
  }
  const docs = sources[SURFACES[8].file] ?? "";
  if (!/testIdPrefix="docs"/.test(docs) && !/data-docs-filter-toolbar/.test(docs)) {
    failures.push("docs-home: Filters panel must use docs testId/data attribute");
  }

  const reportsReq = sources["docs/specs/scoreboard/modules/reports.required.json"] ?? "";
  if (reportsReq) {
    if (!/"id": "chrome\.toolbar_filter"[\s\S]*?"surface_path": "pages\/reports\/runners\/RunnerFilters\.tsx"/.test(reportsReq)) {
      failures.push("reports.required.json: chrome.toolbar_filter surface_path must be RunnerFilters.tsx");
    }
  }
  const runnerFilters = sources["apps/frontend/src/pages/reports/runners/RunnerFilters.tsx"] ?? "";
  if (runnerFilters) {
    if (!runnerFilters.includes("CollapsedListFilters")) {
      failures.push("RunnerFilters.tsx: must mount CollapsedListFilters for chrome.toolbar_filter");
    }
    if (!/\bonApply=\{/.test(runnerFilters)) {
      failures.push("RunnerFilters.tsx: CollapsedListFilters must wire onApply");
    }
    if (!runnerFilters.includes("useStagedListFilters")) {
      failures.push("RunnerFilters.tsx: must stage via useStagedListFilters");
    }
  }

  const vendorsReq = sources["docs/specs/scoreboard/modules/vendors.required.json"] ?? "";
  if (vendorsReq) {
    if (!/"id": "chrome\.toolbar_filter"[\s\S]*?"surface_path": "pages\/vendors\/VendorsListView\.tsx"/.test(vendorsReq)) {
      failures.push("vendors.required.json: chrome.toolbar_filter surface_path must be VendorsListView.tsx");
    }
  }
  const vendors = sources[SURFACES[9].file] ?? "";
  if (!/testIdPrefix="vendors"/.test(vendors) && !/data-vendors-filter-toolbar/.test(vendors)) {
    failures.push("vendors-list: Filters panel must use vendors testId/data attribute");
  }

  const customersReq = sources["docs/specs/scoreboard/modules/customers.required.json"] ?? "";
  if (customersReq) {
    if (!/"id": "chrome\.toolbar_filter"[\s\S]*?"surface_path": "pages\/customers\/CustomersListView\.tsx"/.test(customersReq)) {
      failures.push("customers.required.json: chrome.toolbar_filter surface_path must be CustomersListView.tsx");
    }
  }
  const customers = sources[SURFACES[10].file] ?? "";
  if (!/testIdPrefix="customers"/.test(customers) && !/data-customers-filter-toolbar/.test(customers)) {
    failures.push("customers-list: Filters panel must use customers testId/data attribute");
  }

  const listsReq = sources["docs/specs/scoreboard/modules/lists.required.json"] ?? "";
  if (listsReq) {
    if (
      !/"id": "chrome\.toolbar_filter"[\s\S]*?"surface_path": "components\/lists\/ListView\/components\/FilterPopover\.tsx"/.test(
        listsReq,
      )
    ) {
      failures.push("lists.required.json: chrome.toolbar_filter surface_path must be FilterPopover.tsx");
    }
  }
  const listsFilter = sources["apps/frontend/src/components/lists/ListView/components/FilterPopover.tsx"] ?? "";
  if (listsFilter) {
    if (!/\bApply\b/.test(listsFilter) || !/\bonClick=\{apply\}/.test(listsFilter)) {
      failures.push("FilterPopover.tsx: must keep Apply commit for staged list filters");
    }
    if (!listsFilter.includes("listview-filter-popover")) {
      failures.push("FilterPopover.tsx: must keep listview-filter-popover test id");
    }
  }

  const accountingReq = sources["docs/specs/scoreboard/modules/accounting.required.json"] ?? "";
  if (accountingReq) {
    if (!/"id": "chrome\.toolbar_filter"[\s\S]*?"surface_path": "pages\/accounting\/BillsPage\.tsx"/.test(accountingReq)) {
      failures.push("accounting.required.json: chrome.toolbar_filter surface_path must be BillsPage.tsx");
    }
  }
  const bills = sources["apps/frontend/src/pages/accounting/BillsPage.tsx"] ?? "";
  if (bills) {
    if (!bills.includes("CollapsedListFilters")) {
      failures.push("BillsPage.tsx: must mount CollapsedListFilters for chrome.toolbar_filter");
    }
    if (!/\bonApply=\{/.test(bills)) {
      failures.push("BillsPage.tsx: CollapsedListFilters must wire onApply");
    }
    if (!bills.includes("useStagedListFilters")) {
      failures.push("BillsPage.tsx: must stage via useStagedListFilters");
    }
    if (!/testIdPrefix="bills"/.test(bills) && !/data-bills-filter-toolbar/.test(bills)) {
      failures.push("accounting-bills: Filters panel must use bills testId/data attribute");
    }
  }

  const fleetReq = sources["docs/specs/scoreboard/modules/fleet.required.json"] ?? "";
  if (fleetReq) {
    if (!/"id": "chrome\.toolbar_filter"[\s\S]*?"surface_path": "components\/FleetTable\.tsx"/.test(fleetReq)) {
      failures.push("fleet.required.json: chrome.toolbar_filter surface_path must be FleetTable.tsx");
    }
  }
  const fleet = sources["apps/frontend/src/components/FleetTable.tsx"] ?? "";
  if (fleet) {
    if (!fleet.includes("CollapsedListFilters")) {
      failures.push("FleetTable.tsx: must mount CollapsedListFilters for chrome.toolbar_filter");
    }
    if (!/\bonApply=\{/.test(fleet)) {
      failures.push("FleetTable.tsx: CollapsedListFilters must wire onApply");
    }
    if (!fleet.includes("useStagedListFilters")) {
      failures.push("FleetTable.tsx: must stage via useStagedListFilters");
    }
    if (!/testIdPrefix="fleet"/.test(fleet) && !/data-fleet-filter-toolbar/.test(fleet)) {
      failures.push("fleet-table: Filters panel must use fleet testId/data attribute");
    }
  }

  const dispatchReq = sources["docs/specs/scoreboard/modules/dispatch.required.json"] ?? "";
  if (dispatchReq) {
    if (
      !/"id": "chrome\.toolbar_filter"[\s\S]*?"surface_path": "pages\/dispatch\/AssignmentHistoryPage\.tsx"/.test(
        dispatchReq,
      )
    ) {
      failures.push("dispatch.required.json: chrome.toolbar_filter surface_path must be AssignmentHistoryPage.tsx");
    }
  }
  const assignmentHistory = sources["apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx"] ?? "";
  if (assignmentHistory) {
    if (!assignmentHistory.includes("assignment-history-filters")) {
      failures.push("AssignmentHistoryPage.tsx: must keep assignment-history-filters chrome");
    }
    if (!assignmentHistory.includes("assignment-history-filter-apply")) {
      failures.push("AssignmentHistoryPage.tsx: must keep staged Apply for filters");
    }
  }

  const factoringReq = sources["docs/specs/scoreboard/modules/factoring.required.json"] ?? "";
  if (factoringReq) {
    if (
      !/"id": "chrome\.toolbar_filter"[\s\S]*?"surface_path": "pages\/factoring\/FactoringHome\.tsx"/.test(
        factoringReq,
      )
    ) {
      failures.push("factoring.required.json: chrome.toolbar_filter surface_path must be FactoringHome.tsx");
    }
  }
  const factoringHome = sources["apps/frontend/src/pages/factoring/FactoringHome.tsx"] ?? "";
  if (factoringHome) {
    if (!factoringHome.includes("factoring-home-recourse-filters")) {
      failures.push("FactoringHome.tsx: must keep factoring-home-recourse-filters chrome");
    }
  }

  const maintenanceReq = sources["docs/specs/scoreboard/modules/maintenance.required.json"] ?? "";
  if (maintenanceReq) {
    if (
      !/"id": "chrome\.toolbar_filter"[\s\S]*?"surface_path": "pages\/maintenance\/components\/WorkOrdersTable\.tsx"/.test(
        maintenanceReq,
      )
    ) {
      failures.push("maintenance.required.json: chrome.toolbar_filter surface_path must be WorkOrdersTable.tsx");
    }
  }
  const workOrders = sources["apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx"] ?? "";
  if (workOrders) {
    if (!workOrders.includes("CollapsedListFilters")) {
      failures.push("WorkOrdersTable.tsx: must mount CollapsedListFilters for chrome.toolbar_filter");
    }
    if (!/\bonApply=\{/.test(workOrders)) {
      failures.push("WorkOrdersTable.tsx: CollapsedListFilters must wire onApply");
    }
    if (!workOrders.includes("useStagedListFilters")) {
      failures.push("WorkOrdersTable.tsx: must stage via useStagedListFilters");
    }
    if (!/testIdPrefix="work-orders"/.test(workOrders) && !/data-wo-filter-toolbar/.test(workOrders)) {
      failures.push("maintenance work-orders: Filters panel must use work-orders testId/data attribute");
    }
  }


  const fuelReq = sources["docs/specs/scoreboard/modules/fuel.required.json"] ?? "";
  if (fuelReq) {
    if (
      !/"id": "chrome\.toolbar_filter"[\s\S]*?"surface_path": "pages\/fuel\/card-overage\/CardOverageQueuePage\.tsx"/.test(
        fuelReq,
      )
    ) {
      failures.push("fuel.required.json: chrome.toolbar_filter surface_path must be CardOverageQueuePage.tsx");
    }
  }
  const fuel = sources["apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx"] ?? "";
  if (fuel) {
    if (!fuel.includes("CollapsedListFilters")) {
      failures.push("CardOverageQueuePage.tsx: must mount CollapsedListFilters");
    }
    if (!/\bonApply=\{/.test(fuel)) {
      failures.push("CardOverageQueuePage.tsx: CollapsedListFilters must wire onApply");
    }
    if (!fuel.includes("useStagedListFilters")) {
      failures.push("CardOverageQueuePage.tsx: must stage via useStagedListFilters");
    }
    if (!/testIdPrefix="fuel-card-overage"/.test(fuel)) {
      failures.push("fuel: Filters panel must use fuel-card-overage testIdPrefix");
    }
  }

  const complianceReq = sources["docs/specs/scoreboard/modules/compliance.required.json"] ?? "";
  if (complianceReq) {
    if (
      !/"id": "chrome\.toolbar_filter"[\s\S]*?"surface_path": "pages\/compliance\/FilingsComplianceDueSection\.tsx"/.test(
        complianceReq,
      )
    ) {
      failures.push("compliance.required.json: chrome.toolbar_filter surface_path must be FilingsComplianceDueSection.tsx");
    }
  }
  const compliance = sources["apps/frontend/src/pages/compliance/FilingsComplianceDueSection.tsx"] ?? "";
  if (compliance) {
    if (!compliance.includes("CollapsedListFilters")) {
      failures.push("FilingsComplianceDueSection.tsx: must mount CollapsedListFilters");
    }
    if (!/\bonApply=\{/.test(compliance)) {
      failures.push("FilingsComplianceDueSection.tsx: CollapsedListFilters must wire onApply");
    }
    if (!compliance.includes("useStagedListFilters")) {
      failures.push("FilingsComplianceDueSection.tsx: must stage via useStagedListFilters");
    }
    if (!/testIdPrefix="compliance-filings"/.test(compliance)) {
      failures.push("compliance: Filters panel must use compliance-filings testIdPrefix");
    }
  }

  const inventoryReq = sources["docs/specs/scoreboard/modules/inventory.required.json"] ?? "";
  if (inventoryReq) {
    if (
      !/"id": "chrome\.toolbar_filter"[\s\S]*?"surface_path": "pages\/inventory\/InventoryAssignmentsPage\.tsx"/.test(
        inventoryReq,
      )
    ) {
      failures.push("inventory.required.json: chrome.toolbar_filter surface_path must be InventoryAssignmentsPage.tsx");
    }
  }
  const inventory = sources["apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx"] ?? "";
  if (inventory) {
    if (!inventory.includes("CollapsedListFilters")) {
      failures.push("InventoryAssignmentsPage.tsx: must mount CollapsedListFilters");
    }
    if (!/\bonApply=\{/.test(inventory)) {
      failures.push("InventoryAssignmentsPage.tsx: CollapsedListFilters must wire onApply");
    }
    if (!inventory.includes("useStagedListFilters")) {
      failures.push("InventoryAssignmentsPage.tsx: must stage via useStagedListFilters");
    }
    if (!/testIdPrefix="inventory-assignments"/.test(inventory)) {
      failures.push("inventory: Filters panel must use inventory-assignments testIdPrefix");
    }
  }

  const form425Req = sources["docs/specs/scoreboard/modules/form_425.required.json"] ?? "";
  if (form425Req) {
    if (
      !/"id": "chrome\.toolbar_filter"[\s\S]*?"surface_path": "pages\/form425c\/tabs\/HistoryTab\.tsx"/.test(
        form425Req,
      )
    ) {
      failures.push("form_425.required.json: chrome.toolbar_filter surface_path must be HistoryTab.tsx");
    }
  }
  const form425 = sources["apps/frontend/src/pages/form425c/tabs/HistoryTab.tsx"] ?? "";
  if (form425) {
    if (!form425.includes("CollapsedListFilters")) {
      failures.push("HistoryTab.tsx: must mount CollapsedListFilters");
    }
    if (!/\bonApply=\{/.test(form425)) {
      failures.push("HistoryTab.tsx: CollapsedListFilters must wire onApply");
    }
    if (!form425.includes("useStagedListFilters")) {
      failures.push("HistoryTab.tsx: must stage via useStagedListFilters");
    }
    if (!/testIdPrefix="form425c-history"/.test(form425)) {
      failures.push("form425: Filters panel must use form425c-history testIdPrefix");
    }
  }

  const helpReq = sources["docs/specs/scoreboard/modules/help.required.json"] ?? "";
  if (helpReq) {
    if (
      !/"id": "chrome\.toolbar_filter"[\s\S]*?"surface_path": "pages\/help\/HelpCenterPage\.tsx"/.test(
        helpReq,
      )
    ) {
      failures.push("help.required.json: chrome.toolbar_filter surface_path must be HelpCenterPage.tsx");
    }
  }
  const help = sources["apps/frontend/src/pages/help/HelpCenterPage.tsx"] ?? "";
  if (help) {
    if (!help.includes("CollapsedListFilters")) {
      failures.push("HelpCenterPage.tsx: must mount CollapsedListFilters");
    }
    if (!/\bonApply=\{/.test(help)) {
      failures.push("HelpCenterPage.tsx: CollapsedListFilters must wire onApply");
    }
    if (!help.includes("useStagedListFilters")) {
      failures.push("HelpCenterPage.tsx: must stage via useStagedListFilters");
    }
    if (!/testIdPrefix="help-center"/.test(help)) {
      failures.push("help: Filters panel must use help-center testIdPrefix");
    }
  }

  return failures;
}


function load() {
  const map = Object.fromEntries(SURFACES.map((s) => [s.file, read(s.file)]));
  map["docs/specs/scoreboard/modules/insurance.required.json"] = read(
    "docs/specs/scoreboard/modules/insurance.required.json",
  );
  map["docs/specs/scoreboard/modules/legal.required.json"] = read(
    "docs/specs/scoreboard/modules/legal.required.json",
  );
  map["docs/specs/scoreboard/modules/tasks.required.json"] = read(
    "docs/specs/scoreboard/modules/tasks.required.json",
  );
  map["docs/specs/scoreboard/modules/safety.required.json"] = read(
    "docs/specs/scoreboard/modules/safety.required.json",
  );
  map["docs/specs/scoreboard/modules/docs.required.json"] = read(
    "docs/specs/scoreboard/modules/docs.required.json",
  );
  map["docs/specs/scoreboard/modules/reports.required.json"] = read(
    "docs/specs/scoreboard/modules/reports.required.json",
  );
  map["apps/frontend/src/pages/reports/runners/RunnerFilters.tsx"] = read(
    "apps/frontend/src/pages/reports/runners/RunnerFilters.tsx",
  );
  map["docs/specs/scoreboard/modules/vendors.required.json"] = read(
    "docs/specs/scoreboard/modules/vendors.required.json",
  );
  map["docs/specs/scoreboard/modules/customers.required.json"] = read(
    "docs/specs/scoreboard/modules/customers.required.json",
  );
  map["docs/specs/scoreboard/modules/lists.required.json"] = read(
    "docs/specs/scoreboard/modules/lists.required.json",
  );
  map["apps/frontend/src/components/lists/ListView/components/FilterPopover.tsx"] = read(
    "apps/frontend/src/components/lists/ListView/components/FilterPopover.tsx",
  );
  map["docs/specs/scoreboard/modules/accounting.required.json"] = read(
    "docs/specs/scoreboard/modules/accounting.required.json",
  );
  map["apps/frontend/src/pages/accounting/BillsPage.tsx"] = read(
    "apps/frontend/src/pages/accounting/BillsPage.tsx",
  );
  map["apps/frontend/src/components/FleetTable.tsx"] = read(
    "apps/frontend/src/components/FleetTable.tsx",
  );
  map["docs/specs/scoreboard/modules/fleet.required.json"] = read(
    "docs/specs/scoreboard/modules/fleet.required.json",
  );
  map["docs/specs/scoreboard/modules/dispatch.required.json"] = read(
    "docs/specs/scoreboard/modules/dispatch.required.json",
  );
  map["docs/specs/scoreboard/modules/factoring.required.json"] = read(
    "docs/specs/scoreboard/modules/factoring.required.json",
  );
  map["apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx"] = read(
    "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx",
  );
  map["apps/frontend/src/pages/factoring/FactoringHome.tsx"] = read(
    "apps/frontend/src/pages/factoring/FactoringHome.tsx",
  );
  map["docs/specs/scoreboard/modules/maintenance.required.json"] = read(
    "docs/specs/scoreboard/modules/maintenance.required.json",
  );
  map["apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx"] = read(
    "apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx",
  );
  map["docs/specs/scoreboard/modules/fuel.required.json"] = read(
    "docs/specs/scoreboard/modules/fuel.required.json",
  );
  map["apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx"] = read(
    "apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx",
  );
  map["docs/specs/scoreboard/modules/compliance.required.json"] = read(
    "docs/specs/scoreboard/modules/compliance.required.json",
  );
  map["apps/frontend/src/pages/compliance/FilingsComplianceDueSection.tsx"] = read(
    "apps/frontend/src/pages/compliance/FilingsComplianceDueSection.tsx",
  );
  map["docs/specs/scoreboard/modules/inventory.required.json"] = read(
    "docs/specs/scoreboard/modules/inventory.required.json",
  );
  map["apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx"] = read(
    "apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx",
  );
  map["docs/specs/scoreboard/modules/form_425.required.json"] = read(
    "docs/specs/scoreboard/modules/form_425.required.json",
  );
  map["apps/frontend/src/pages/form425c/tabs/HistoryTab.tsx"] = read(
    "apps/frontend/src/pages/form425c/tabs/HistoryTab.tsx",
  );
  map["docs/specs/scoreboard/modules/help.required.json"] = read(
    "docs/specs/scoreboard/modules/help.required.json",
  );
  map["apps/frontend/src/pages/help/HelpCenterPage.tsx"] = read(
    "apps/frontend/src/pages/help/HelpCenterPage.tsx",
  );
  return map;
}

const sources = load();
const failures = collectFailures(sources);
if (failures.length) {
  console.error(`filter-panel guard failed:\n${failures.map((f) => `- ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutations = [
    () => ({ ...sources, [SURFACES[0].file]: sources[SURFACES[0].file].replaceAll("CollapsedListFilters", "BrokenFilters") }),
    () => ({ ...sources, [SURFACES[1].file]: sources[SURFACES[1].file].replace(/\bonApply=\{/g, "onIgnore={") }),
    () => ({ ...sources, [SURFACES[2].file]: sources[SURFACES[2].file].replaceAll("useStagedListFilters", "useBrokenFilters") }),
    () => ({
      ...sources,
      [SURFACES[2].file]: sources[SURFACES[2].file]
        .replace(/testIdPrefix="cash-flow-avp"/g, 'testIdPrefix="broken"')
        .replace(/data-cash-flow-avp-filter-toolbar/g, "data-broken"),
    }),
    () => ({
      ...sources,
      [SURFACES[3].file]: sources[SURFACES[3].file].replaceAll("CollapsedListFilters", "BrokenFilters"),
    }),
    () => ({
      ...sources,
      "docs/specs/scoreboard/modules/insurance.required.json": sources[
        "docs/specs/scoreboard/modules/insurance.required.json"
      ].replaceAll('"/safety/insurance/lawsuits"', '"/insurance"'),
    }),
    () => ({
      ...sources,
      [SURFACES[4].file]: sources[SURFACES[4].file].replaceAll("CollapsedListFilters", "BrokenFilters"),
    }),
    () => ({
      ...sources,
      "docs/specs/scoreboard/modules/legal.required.json": sources[
        "docs/specs/scoreboard/modules/legal.required.json"
      ].replaceAll('"/legal/matters"', '"/legal"'),
    }),
    () => ({
      ...sources,
      [SURFACES[6].file]: sources[SURFACES[6].file].replaceAll("CollapsedListFilters", "BrokenFilters"),
    }),
    () => ({
      ...sources,
      "docs/specs/scoreboard/modules/safety.required.json": sources[
        "docs/specs/scoreboard/modules/safety.required.json"
      ].replaceAll('"/safety/integrity-reports"', '"/safety"'),
    }),
    () => ({
      ...sources,
      [SURFACES[8].file]: sources[SURFACES[8].file].replaceAll("CollapsedListFilters", "BrokenFilters"),
    }),
    () => ({
      ...sources,
      "docs/specs/scoreboard/modules/reports.required.json": sources[
        "docs/specs/scoreboard/modules/reports.required.json"
      ].replaceAll("pages/reports/runners/RunnerFilters.tsx", "components/table/UniversalListToolbar.tsx"),
    }),
    () => ({
      ...sources,
      [SURFACES[9].file]: sources[SURFACES[9].file].replaceAll("CollapsedListFilters", "BrokenFilters"),
    }),
    () => ({
      ...sources,
      "docs/specs/scoreboard/modules/vendors.required.json": sources[
        "docs/specs/scoreboard/modules/vendors.required.json"
      ].replaceAll("pages/vendors/VendorsListView.tsx", "components/table/UniversalListToolbar.tsx"),
    }),
    () => ({
      ...sources,
      [SURFACES[10].file]: sources[SURFACES[10].file].replaceAll("CollapsedListFilters", "BrokenFilters"),
    }),
    () => ({
      ...sources,
      "docs/specs/scoreboard/modules/lists.required.json": sources[
        "docs/specs/scoreboard/modules/lists.required.json"
      ].replaceAll(
        "components/lists/ListView/components/FilterPopover.tsx",
        "components/table/UniversalListToolbar.tsx",
      ),
    }),
    () => ({
      ...sources,
      "apps/frontend/src/pages/accounting/BillsPage.tsx": sources[
        "apps/frontend/src/pages/accounting/BillsPage.tsx"
      ].replaceAll("CollapsedListFilters", "BrokenFilters"),
    }),
    () => ({
      ...sources,
      "apps/frontend/src/components/FleetTable.tsx": sources[
        "apps/frontend/src/components/FleetTable.tsx"
      ].replaceAll("CollapsedListFilters", "BrokenFilters"),
    }),
    () => ({
      ...sources,
      "docs/specs/scoreboard/modules/dispatch.required.json": sources[
        "docs/specs/scoreboard/modules/dispatch.required.json"
      ].replaceAll(
        "pages/dispatch/AssignmentHistoryPage.tsx",
        "components/table/UniversalListToolbar.tsx",
      ),
    }),
    () => ({
      ...sources,
      "docs/specs/scoreboard/modules/factoring.required.json": sources[
        "docs/specs/scoreboard/modules/factoring.required.json"
      ].replaceAll("pages/factoring/FactoringHome.tsx", "components/table/UniversalListToolbar.tsx"),
    }),
    () => ({
      ...sources,
      "docs/specs/scoreboard/modules/maintenance.required.json": sources[
        "docs/specs/scoreboard/modules/maintenance.required.json"
      ].replaceAll(
        "pages/maintenance/components/WorkOrdersTable.tsx",
        "components/table/UniversalListToolbar.tsx",
      ),
    }),
    () => ({
      ...sources,
      "apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx": sources[
        "apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx"
      ].replaceAll("CollapsedListFilters", "BrokenFilters"),
    }),
    () => ({
      ...sources,
      "apps/frontend/src/pages/compliance/FilingsComplianceDueSection.tsx": sources[
        "apps/frontend/src/pages/compliance/FilingsComplianceDueSection.tsx"
      ].replaceAll("CollapsedListFilters", "BrokenFilters"),
    }),
    () => ({
      ...sources,
      "apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx": sources[
        "apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx"
      ].replaceAll("CollapsedListFilters", "BrokenFilters"),
    }),
    () => ({
      ...sources,
      "apps/frontend/src/pages/form425c/tabs/HistoryTab.tsx": sources[
        "apps/frontend/src/pages/form425c/tabs/HistoryTab.tsx"
      ].replaceAll("CollapsedListFilters", "BrokenFilters"),
    }),
    () => ({
      ...sources,
      "apps/frontend/src/pages/help/HelpCenterPage.tsx": sources[
        "apps/frontend/src/pages/help/HelpCenterPage.tsx"
      ].replaceAll("CollapsedListFilters", "BrokenFilters"),
    }),
  ];
  mutations.forEach((mutate, index) => {
    if (!collectFailures(mutate()).length) {
      throw new Error(`self-test mutation ${index + 1} survived`);
    }
  });
  console.log(`PASS: ${mutations.length} planted missing-Filters-panel defects were rejected`);
}

console.log(
  "PASS: filter-panel wave drained (incl. fuel/compliance/inventory/form425/help)",
);
