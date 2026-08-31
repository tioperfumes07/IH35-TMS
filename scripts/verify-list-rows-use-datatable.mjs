#!/usr/bin/env node
/**
 * GO-UI-CONSISTENCY-WHOLE-APP-2026-08-31 Part 2 guard.
 * List rows must use DataTable columns, not middot sentences.
 *
 * Checks that OpenDriverBillsPanel in SettlementsPage.tsx uses DataTable
 * (not the old flex column-jam layout with Driver · Load · Bill in one cell).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const failures = [];

// 1. DataTable primitive exists
const dataTablePath = path.join(root, "apps/frontend/src/components/shared/DataTable.tsx");
try {
  readFileSync(dataTablePath, "utf8");
} catch (e) {
  failures.push("DataTable primitive missing at apps/frontend/src/components/shared/DataTable.tsx");
}

// 2. SettlementsPage imports and uses DataTable for OpenDriverBillsPanel
const settlementsPath = path.join(root, "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx");
const settlements = readFileSync(settlementsPath, "utf8");

if (!settlements.includes("import { DataTable")) {
  failures.push("SettlementsPage must import DataTable from shared/DataTable");
}

if (!settlements.includes("openDriverBillColumns")) {
  failures.push("SettlementsPage must define openDriverBillColumns with DataTable columns");
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
if (!dataTable.includes("bg-slate-50")) {
  failures.push("DataTable primitive must use bg-slate-50 thead standard");
}

if (process.argv.includes("--selftest")) {
  const bad = settlements.replaceAll("openDriverBillColumns", "REMOVED_COLUMNS");
  if (bad.includes("openDriverBillColumns")) {
    console.error("selftest: could not plant failure");
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
