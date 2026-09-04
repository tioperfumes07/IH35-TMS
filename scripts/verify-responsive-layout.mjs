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
  const tableFitContract = ':where(div, section, main, article):has(> table)';
  assertIncludes(indexCss, tableFitContract, "Global table container fit-to-page contract missing");
  assertIncludes(indexCss, "overflow-x: auto;", "Global table container must scroll internally");
  assertIncludes(indexCss, ':where(main, section, article, aside, form, [role="dialog"])', "Page/modal min-width contract missing");
  assertIncludes(indexCss, "overflow-wrap: anywhere;", "Long table-cell content may still force page overflow");

  const bankingTransactions = read("apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx");
  assertNotIncludes(bankingTransactions, "min-w-[1900px]", "Banking Transactions table still forces horizontal overflow");
  // Phase B: register shell is shared ParityTable (which renders table-fixed). Assert the migration
  // + that ParityTable still carries the fixed-layout contract — never weaken to "any table".
  assertIncludes(bankingTransactions, "ParityTable", "Banking Transactions register must use shared ParityTable");
  const parityTable = read("apps/frontend/src/components/parity/ParityTable.tsx");
  assertIncludes(parityTable, "table-fixed", "ParityTable must keep table-fixed (Banking Transactions fixed responsive layout)");

  // dispatch/components/LoadTable.tsx was deleted (orphan-triage batch 05) as a verified-dead
  // duplicate of DispatchBoard, which is the live dispatch loads table — check its responsive
  // contract instead (scroll-container pattern, not table-fixed; see CLAUDE.md §7).
  const dispatchBoard = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
  assertNotIncludes(dispatchBoard, "min-w-[1400px]", "Dispatch board table still forces horizontal overflow");
  if (!dispatchBoard.includes("overflow-x-auto") && !indexCss.includes(tableFitContract)) {
    throw new Error("Dispatch board table must scroll inside a local or global overflow-x-auto container");
  }

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

  if (process.argv.includes("--selftest")) {
    const planted = indexCss.replace(tableFitContract, ":where(div):has(> .not-a-table)");
    let caught = false;
    try {
      assertIncludes(planted, tableFitContract, "planted fit-to-page mutation escaped");
    } catch {
      caught = true;
    }
    if (!caught) throw new Error("selftest failed to detect removed global table contract");
    console.log("✅ Responsive layout guard selftest passed — planted contract removal detected");
  } else {
    console.log("✅ Responsive layout guard passed");
  }
} catch (error) {
  console.error(`✘ ${error.message}`);
  process.exit(1);
}
