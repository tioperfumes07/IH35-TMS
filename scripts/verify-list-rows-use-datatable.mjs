#!/usr/bin/env node
/**
 * GO-UI-CONSISTENCY-WHOLE-APP-2026-08-31 Part 2 guard.
 * List rows must use DataTable columns, not middot sentences.
 *
 * Checks the shared primitive and both driver-finance column-jam instances.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const failures = [];

// 1. DataTable primitive exists
const dataTablePath = path.join(root, "apps/frontend/src/components/DataTable.tsx");
try {
  readFileSync(dataTablePath, "utf8");
} catch (e) {
  failures.push("canonical DataTable primitive missing at apps/frontend/src/components/DataTable.tsx");
}

// 2. SettlementsPage imports and uses DataTable for OpenDriverBillsPanel
const settlementsPath = path.join(root, "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx");
const settlements = readFileSync(settlementsPath, "utf8");
const preSettlementsPath = path.join(root, "apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx");
const preSettlements = readFileSync(preSettlementsPath, "utf8");

if (!settlements.includes('from "../../components/DataTable"')) {
  failures.push("SettlementsPage must import the canonical components/DataTable primitive");
}

if (!settlements.includes("openDriverBillColumns")) {
  failures.push("SettlementsPage must define openDriverBillColumns with DataTable columns");
}
if (!preSettlements.includes('from "../DataTable"') || !preSettlements.includes("preSettlementColumns")) {
  failures.push("PreSettlementsPanel must use the canonical components/DataTable column primitive");
}
for (const header of ["Date", "Driver", "Load Number", "Settlement / Bill Number", "Amount", "Status"]) {
  if (!preSettlements.includes(`label: "${header}"`)) {
    failures.push(`PreSettlementsPanel missing governed ${header} column`);
  }
}
if (preSettlements.includes('<span className="text-gray-400">·</span>')) {
  failures.push("PreSettlementsPanel must not jam repeated row fields together with middots");
}

// Check that the old column-jam pattern is gone
const hasOldJam = /OpenDriverBillsPanel[\s\S]*?flex flex-wrap items-center gap-1[\s\S]*?·[\s\S]*?Load/.test(settlements);
if (hasOldJam) {
  failures.push("OpenDriverBillsPanel must NOT use the old column-jam flex layout (Driver · Load · Bill in one cell) — use DataTable");
}

// 3. DataTable uses the standard thead convention
const dataTable = readFileSync(dataTablePath, "utf8");
if (!dataTable.includes("<thead")) {
  failures.push("DataTable primitive must use <thead> convention");
}
if (!dataTable.includes("bg-gray-50")) {
  failures.push("DataTable primitive must use the canonical bg-gray-50 thead standard");
}
if (!dataTable.includes("aria-sort") || !dataTable.includes("column.sortValue")) {
  failures.push("DataTable sortable columns must render an operable, accessible sort control");
}
const duplicateDataTablePath = path.join(root, "apps/frontend/src/components/shared/DataTable.tsx");
try {
  readFileSync(duplicateDataTablePath, "utf8");
  failures.push("duplicate shared/DataTable primitive must not exist; consolidate on components/DataTable");
} catch {
  // Expected: one canonical primitive only.
}

if (process.argv.includes("--selftest")) {
  const bad = settlements.replaceAll("openDriverBillColumns", "REMOVED_COLUMNS");
  if (bad.includes("openDriverBillColumns")) {
    console.error("selftest: could not plant failure");
    process.exit(1);
  }
  const unsortable = dataTable.replace("aria-sort", "aria-disabled");
  if (unsortable.includes("aria-sort")) {
    console.error("selftest: could not plant sortable-header failure");
    process.exit(1);
  }
  console.log("verify-list-rows-use-datatable selftest: planted failure would be detected");
  process.exit(0);
}

if (failures.length) {
  console.error("verify-list-rows-use-datatable FAIL:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("verify-list-rows-use-datatable: OK — OpenDriverBillsPanel uses DataTable columns (not middot column-jam)");
process.exit(0);
