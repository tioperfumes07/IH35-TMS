#!/usr/bin/env node
// Guard (GLOBAL-TABLE-CONTROLS): the shared data-grid toolbar must stay a single shared
// component set under components/table/*, and consumers must REUSE it (not re-fork their own
// paginator / column chooser / search per page). Fleet is the first consumer.
import { readFileSync, existsSync } from "node:fs";

const failures = [];

const SEARCH = "apps/frontend/src/components/table/TableSearch.tsx";
const searchSrc = existsSync(SEARCH) ? readFileSync(SEARCH, "utf8") : "";
if (!searchSrc) {
  failures.push(`${SEARCH}: missing`);
} else {
  // DISPATCH-SEARCH-BOX-KEYSTROKE-LOSS — visible value is local; parent emit is debounced.
  if (!/useState\(value\)/.test(searchSrc) || !/lastEmittedRef/.test(searchSrc) || !/EMIT_MS/.test(searchSrc)) {
    failures.push(`${SEARCH}: must keep a local buffer (useState) + lastEmittedRef + EMIT_MS debounce; do not bind value={value} to a per-keystroke URL parent`);
  }
  if (/onInput=\{\(e\) => onChange/.test(searchSrc) && /onChange=\{\(e\) => onChange/.test(searchSrc)) {
    failures.push(`${SEARCH}: dual onChange+onInput both calling parent onChange reintroduces keystroke loss`);
  }
}

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

// BANK-F91307 leftover refuse — Paginator.tsx page-scoped text token ratchet
const PAGINATOR = "apps/frontend/src/components/table/Paginator.tsx";
let paginatorSrc = "";
try {
  paginatorSrc = readFileSync(PAGINATOR, "utf8");
} catch {
  failures.push(`${PAGINATOR}: missing`);
}
if (paginatorSrc) {
  if (paginatorSrc.includes("text-[11px]")) failures.push(`${PAGINATOR}: leftover text-[11px]`);
  if (paginatorSrc.includes("#8A92AB") || paginatorSrc.includes("#334155")) {
    failures.push(`${PAGINATOR}: leftover off-scale muted`);
  }
}

// BANK-F91330 leftover refuse — ColumnChooser.tsx page-scoped text token ratchet (B-1 gear)
const COLUMN_CHOOSER = "apps/frontend/src/components/table/ColumnChooser.tsx";
let columnChooserSrc = "";
try {
  columnChooserSrc = readFileSync(COLUMN_CHOOSER, "utf8");
} catch {
  failures.push(`${COLUMN_CHOOSER}: missing`);
}
if (columnChooserSrc) {
  if (columnChooserSrc.includes("text-[11px]")) failures.push(`${COLUMN_CHOOSER}: leftover text-[11px]`);
  if (columnChooserSrc.includes("#8A92AB") || columnChooserSrc.includes("#334155")) {
    failures.push(`${COLUMN_CHOOSER}: leftover off-scale muted`);
  }
}

if (process.argv.includes("--selftest")) {
  const planted = searchSrc.replaceAll("lastEmittedRef", "notTheBuffer");
  const plantedFails =
    !/useState\(value\)/.test(planted) || !/lastEmittedRef/.test(planted) || !/EMIT_MS/.test(planted);
  if (!plantedFails) {
    console.error("selftest: planted TableSearch without lastEmittedRef must fail the buffer check");
    process.exit(1);
  }
  // BANK-F91307 leftover plant — Paginator page-scoped text token ratchet
  const realGood = readFileSync(PAGINATOR, "utf8");
  const leftoverPlant = realGood + '\n<div className="text-[11px] text-[#8A92AB]">plant</div>\n';
  const plantCaught =
    leftoverPlant.includes("text-[11px]") ||
    leftoverPlant.includes("#8A92AB") ||
    leftoverPlant.includes("#334155");
  if (!plantCaught) {
    console.error("selftest: leftover plant escaped");
    process.exit(1);
  }
  // BANK-F91330 leftover plant — ColumnChooser page-scoped text token ratchet
  const chooserGood = readFileSync(COLUMN_CHOOSER, "utf8");
  const chooserPlant = chooserGood + '\n<div className="text-[11px] text-[#8A92AB]">plant</div>\n';
  const chooserCaught =
    chooserPlant.includes("text-[11px]") ||
    chooserPlant.includes("#8A92AB") ||
    chooserPlant.includes("#334155");
  if (!chooserCaught) {
    console.error("selftest: ColumnChooser leftover plant escaped");
    process.exit(1);
  }
  console.log("verify:table-controls-shared --selftest OK");
  process.exit(0);
}

if (failures.length) {
  console.error("verify:table-controls-shared — FAIL");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("verify:table-controls-shared — OK (shared components/table/* present and reused by Fleet)");
