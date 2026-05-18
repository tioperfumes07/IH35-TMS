#!/usr/bin/env node
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message);
}

function assertNotIncludes(source, needle, message) {
  if (source.includes(needle)) throw new Error(message);
}

try {
  const indexCss = read("apps/frontend/src/index.css");
  assertIncludes(indexCss, "overflow-x: hidden;", "Global horizontal overflow protection missing");

  const bankingTransactions = read("apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx");
  assertNotIncludes(bankingTransactions, "min-w-[1900px]", "Banking Transactions table still forces horizontal overflow");
  assertIncludes(bankingTransactions, "table-fixed", "Banking Transactions table must use fixed responsive layout");

  const dispatchLoadTable = read("apps/frontend/src/pages/dispatch/components/LoadTable.tsx");
  assertNotIncludes(dispatchLoadTable, "min-w-[1400px]", "Dispatch load table still forces horizontal overflow");
  assertIncludes(dispatchLoadTable, "table-fixed", "Dispatch load table must use fixed responsive layout");

  const customers = read("apps/frontend/src/pages/Customers.tsx");
  assertNotIncludes(customers, "min-w-[1200px]", "Customers table still forces horizontal overflow");

  const vendors = read("apps/frontend/src/pages/Vendors.tsx");
  assertNotIncludes(vendors, "min-w-[1200px]", "Vendors table still forces horizontal overflow");

  const maintenanceWorkOrders = read("apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx");
  assertNotIncludes(maintenanceWorkOrders, "min-w-[1200px]", "Maintenance work orders table still forces horizontal overflow");

  const maintenanceDriverReports = read("apps/frontend/src/pages/maintenance/DriverReportsQueuePage.tsx");
  assertNotIncludes(maintenanceDriverReports, "min-w-[980px]", "Maintenance driver reports table still forces horizontal overflow");

  const fuelStops = read("apps/frontend/src/pages/fuel/components/StopReasoningTable.tsx");
  assertNotIncludes(fuelStops, "min-w-[900px]", "Fuel stop reasoning table still forces horizontal overflow");

  const fuelDiagram = read("apps/frontend/src/pages/fuel/components/RouteDiagramSvg.tsx");
  assertNotIncludes(fuelDiagram, "min-w-[1100px]", "Fuel route diagram still forces horizontal overflow");

  const dataTable = read("apps/frontend/src/components/DataTable.tsx");
  assertIncludes(dataTable, "table-fixed", "Shared DataTable must use fixed responsive layout");

  console.log("✅ Responsive layout guard passed");
} catch (error) {
  console.error(`✘ ${error.message}`);
  process.exit(1);
}
