#!/usr/bin/env node
// DISPATCH-REDESIGN Part B/C guard.
// Locks the unified dispatch board column model and the three List/Table sections so they
// cannot silently regress:
//   - ONE shared `boardColumns` array; List and Table both alias it (identical grid).
//   - Jorge's exact 17-column order, with Lane split into Pickup + Delivery.
//   - HOS columns (Hrs available / Hrs to reset) render a placeholder ("—"), feed HELD.
//   - Three sections: Awaiting assignment / Booked / Out of service.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
const src = readFileSync(file, "utf8");

const fail = (msg) => {
  console.error(`FAIL verify-dispatch-board-sections-and-columns: ${msg}`);
  process.exit(1);
};

// 1. One shared column model, List and Table both alias it.
if (!src.includes("const boardColumns")) fail("missing shared `boardColumns` model");
if (!/const listColumns = boardColumns/.test(src)) fail("listColumns must alias boardColumns (List == Table grid)");
if (!/const tableColumns = boardColumns/.test(src)) fail("tableColumns must alias boardColumns (List == Table grid)");

// 2. Exact column key order (Lane split into pickup + delivery).
const expectedOrder = [
  "unit", "trailer", "driver", "hrs_available", "hrs_to_reset", "load", "customer",
  "commodity", "pickup", "delivery", "wo", "cargo_temp", "linehaul", "status_signal",
  "live_gps", "risk", "status",
];
const modelStart = src.indexOf("const boardColumns");
const modelEnd = src.indexOf("];", modelStart);
if (modelStart < 0 || modelEnd < 0) fail("could not locate boardColumns array bounds");
const modelBlock = src.slice(modelStart, modelEnd);
const foundKeys = [...modelBlock.matchAll(/key:\s*"([a-z_]+)"/g)].map((m) => m[1]);
if (foundKeys.join(",") !== expectedOrder.join(",")) {
  fail(`column order drifted.\n  expected: ${expectedOrder.join(",")}\n  found:    ${foundKeys.join(",")}`);
}

// 3. HOS columns are WIRED to the in-app HOS store (feed resolved 2026-06-17 — /safety/hos
//    cycle clocks, not Samsara). They must bind to the real cycle-clock renderers.
if (!/hrs_available[\s\S]{0,120}renderHosAvailable/.test(src)) fail("hrs_available must bind to renderHosAvailable (in-app HOS store)");
if (!/hrs_to_reset[\s\S]{0,120}renderHosToReset/.test(src)) fail("hrs_to_reset must bind to renderHosToReset (in-app HOS store)");
if (src.includes("Driver HOS feed pending")) fail("HOS placeholder 'feed pending' must be removed — the feed is resolved/wired");

// 4. Three List/Table sections, exact titles. The 3rd is "In shop" (units down for maintenance) —
// distinct from the pinned bottom "Fleet OOS" strip (units actually out of service); no duplicate
// "Out of service" label in the table.
if (!src.includes("SECTION_META")) fail("SECTION_META (section titles) missing");
for (const title of ["Awaiting assignment", "Booked", "In shop"]) {
  if (!src.includes(`"${title}"`)) fail(`missing section title: ${title}`);
}
if (/title:\s*"Out of service"/.test(src)) fail('in-table 3rd section must be "In shop", not "Out of service" (no duplicate label)');

// 4b. TRUCK-CENTRIC partition (Jorge 2026-06-17): Awaiting = active fleet roster minus loaded
// trucks (unitsWithoutLoad → unitToBoardRow), NOT loads.filter. Booked = active loads.
if (!src.includes("unitToBoardRow")) fail("Awaiting must render trucks via unitToBoardRow (roster-derived)");
if (!/awaitingRows\s*=\s*unassignedUnits\.map\(unitToBoardRow\)/.test(src)) {
  fail("Awaiting rows must be unassignedUnits.map(unitToBoardRow) (truck roster minus loaded), not loads.filter");
}
if (/key:\s*"awaiting"[\s\S]{0,80}loads\.filter\(isUnassignedLoad\)/.test(src)) {
  fail("Awaiting must NOT be derived from loads.filter — it is truck-derived now");
}
if (!src.includes("enabled: Boolean(companyId),")) fail("unitsWithoutLoad must load in every mode (not just assignment) for the truck-derived Awaiting section");

console.log("PASS verify-dispatch-board-sections-and-columns");
