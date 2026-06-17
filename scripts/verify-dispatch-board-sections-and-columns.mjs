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

// 4. Three List/Table sections, exact titles.
if (!src.includes("LIST_SECTIONS")) fail("LIST_SECTIONS partition missing");
for (const title of ["Awaiting assignment", "Booked", "Out of service"]) {
  if (!src.includes(`"${title}"`)) fail(`missing section title: ${title}`);
}

// 4b. Partition PREDICATE, not just titles: Awaiting = isUnassignedLoad (no truck), Booked =
// !isUnassignedLoad. Guards against the inverted isBookedReserved basis that put unassigned loads
// under "Booked".
const sectionsDecl = src.indexOf("const LIST_SECTIONS");
// Start at the array LITERAL (`}> = [`) so the type annotation's `DispatchLoadRow[];` doesn't end
// the slice early on its `];`.
const sectionsStart = src.indexOf("}> = [", sectionsDecl);
const sectionsEnd = src.indexOf("];", sectionsStart);
const sectionsBlock = sectionsStart >= 0 && sectionsEnd >= 0 ? src.slice(sectionsStart, sectionsEnd) : "";
if (!sectionsBlock.includes("loads.filter(isUnassignedLoad)")) {
  fail("Awaiting assignment must partition on isUnassignedLoad (loads with no truck assigned)");
}
if (!sectionsBlock.includes("!isUnassignedLoad(load)")) {
  fail("Booked must partition on !isUnassignedLoad");
}
if (sectionsBlock.includes("isBookedReserved")) {
  fail("LIST_SECTIONS must NOT use the inverted isBookedReserved basis");
}

console.log("PASS verify-dispatch-board-sections-and-columns");
