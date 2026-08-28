#!/usr/bin/env node
// Guard (DISPATCH-REDESIGN Part A / CHROME-02): the dispatch filter is the slim QuickBooks-style
// toolbar (search + Filters popover + gear) reusing the shared table-controls component —
// NOT the old 196px stacked 3-row block, and NOT a per-page re-fork. Also locks the
// Date From/To double-outline fix (DatePicker must not be wrapped in another border).
//
// CHROME-02: FilterBar is the ORIGINAL toolbar the shared `CollapsedListFilters` gold pattern
// was extracted from (components/table/CollapsedListFilters.tsx). It now delegates to that
// shared component itself instead of keeping its own duplicate filtersOpen/ref/popover chrome —
// so this guard checks for the shared component, and separately re-verifies the shared
// component still gates every consumer behind a real Filters popover.
import { readFileSync } from "node:fs";

const F = "apps/frontend/src/components/dispatch/FilterBar.tsx";
const SHARED = "apps/frontend/src/components/table/CollapsedListFilters.tsx";
const failures = [];
let s = "";
try { s = readFileSync(F, "utf8"); } catch { failures.push(`${F}: missing`); }
let shared = "";
try { shared = readFileSync(SHARED, "utf8"); } catch { failures.push(`${SHARED}: missing`); }

if (s) {
  if (!/from "\.\.\/\.\.\/components\/table"/.test(s)) {
    failures.push(`${F}: must reuse the shared table-controls (TableSearch/ColumnChooser/CollapsedListFilters) from components/table`);
  }
  if (!/TableSearch/.test(s)) failures.push(`${F}: slim toolbar must use the shared TableSearch`);
  if (!/onSearchChange/.test(s) || !/useCallback/.test(s)) {
    failures.push(`${F}: TableSearch onChange must be a stable useCallback (onSearchChange), not an inline arrow that rebinds native listeners`);
  }
  if (!/CollapsedListFilters/.test(s)) {
    failures.push(`${F}: must delegate to the shared CollapsedListFilters gold pattern, not a bespoke popover`);
  }
  // Double-outline fix: DatePicker must not be wrapped with its own border (box-in-box).
  if (/<DatePicker[^>]*className="[^"]*border /.test(s)) {
    failures.push(`${F}: DatePicker has a border className — double-outline (box-in-box) regression`);
  }
}
if (shared && !/filtersOpen/.test(shared)) {
  failures.push(`${SHARED}: filters must collapse into a popover (filtersOpen), not the 196px stacked block`);
}

if (failures.length) {
  console.error("verify:dispatch-filter-toolbar — FAIL");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("verify:dispatch-filter-toolbar — OK (slim shared toolbar; no 196px block; no date double-outline)");
