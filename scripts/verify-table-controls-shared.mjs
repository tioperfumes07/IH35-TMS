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
  "apps/frontend/src/components/table/useTableController.ts",
  "apps/frontend/src/components/table/useTablePref.ts",
  "apps/frontend/src/components/table/index.ts",
];
for (const f of REQUIRED) {
  if (!existsSync(f)) failures.push(`${f}: missing (shared table control component)`);
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

if (failures.length) {
  console.error("verify:table-controls-shared — FAIL");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("verify:table-controls-shared — OK (shared components/table/* present and reused by Fleet)");
