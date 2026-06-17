#!/usr/bin/env node
// Guard (GLOBAL-TABLE-CONTROLS): the shared data-grid toolbar must stay a single shared
// component set under components/table/*, and consumers must REUSE it (not re-fork their own
// paginator / column chooser / search per page). Fleet is the first consumer.
import { readFileSync, existsSync } from "node:fs";

const failures = [];

const REQUIRED = [
  "apps/frontend/src/components/table/TableControls.tsx",
  "apps/frontend/src/components/table/ColumnChooser.tsx",
  "apps/frontend/src/components/table/Paginator.tsx",
  "apps/frontend/src/components/table/TableSearch.tsx",
  "apps/frontend/src/components/table/TableHeaderCell.tsx",
  "apps/frontend/src/components/table/useTableController.ts",
  "apps/frontend/src/components/table/useTablePref.ts",
  "apps/frontend/src/components/table/index.ts",
];
for (const f of REQUIRED) {
  if (!existsSync(f)) failures.push(`${f}: missing (shared table control component)`);
}

// Global table features (sort + resize) must live in the shared component, not per-page.
const controller = existsSync(REQUIRED[5]) ? readFileSync("apps/frontend/src/components/table/useTableController.ts", "utf8") : "";
if (controller && (!/toggleSort/.test(controller) || !/sortValue/.test(controller))) {
  failures.push("useTableController.ts: click-header sort (toggleSort/sortValue) must be in the shared controller");
}
const pref = existsSync("apps/frontend/src/components/table/useTablePref.ts")
  ? readFileSync("apps/frontend/src/components/table/useTablePref.ts", "utf8")
  : "";
if (pref && !/setColumnWidth/.test(pref)) {
  failures.push("useTablePref.ts: column resize (setColumnWidth/widths) must be in the shared pref hook");
}

// Fleet must consume the shared component, not re-implement it.
const FLEET = "apps/frontend/src/components/FleetTable.tsx";
let fleet = "";
try {
  fleet = readFileSync(FLEET, "utf8");
} catch {
  failures.push(`${FLEET}: missing`);
}
if (fleet) {
  if (!/from "\.\/table"/.test(fleet)) {
    failures.push(`${FLEET}: must import the shared toolbar from "./table" (no per-page re-fork)`);
  }
  for (const sym of ["TableControls", "Paginator", "useTableController"]) {
    if (!fleet.includes(sym)) failures.push(`${FLEET}: must use shared ${sym}`);
  }
}

// Customers + Vendors list views must also reuse the shared component (no per-page re-fork).
for (const consumer of [
  "apps/frontend/src/pages/customers/CustomersListView.tsx",
  "apps/frontend/src/pages/vendors/VendorsListView.tsx",
]) {
  let src = "";
  try { src = readFileSync(consumer, "utf8"); } catch { failures.push(`${consumer}: missing`); continue; }
  if (!/from "\.\.\/\.\.\/components\/table"/.test(src)) {
    failures.push(`${consumer}: must import the shared toolbar from components/table (no re-fork)`);
  }
  if (/useColumnWidths|ResizableTh/.test(src)) {
    failures.push(`${consumer}: still uses bespoke useColumnWidths/ResizableTh — should use shared TableHeaderCell`);
  }
}

if (failures.length) {
  console.error("verify:table-controls-shared — FAIL");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("verify:table-controls-shared — OK (shared components/table/* present and reused by Fleet)");
