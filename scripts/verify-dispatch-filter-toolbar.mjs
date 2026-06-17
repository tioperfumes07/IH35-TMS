#!/usr/bin/env node
// Guard (DISPATCH-REDESIGN Part A): the dispatch filter is the slim QuickBooks-style
// toolbar (search + Filters popover + gear) reusing the shared table-controls component —
// NOT the old 196px stacked 3-row block, and NOT a per-page re-fork. Also locks the
// Date From/To double-outline fix (DatePicker must not be wrapped in another border).
import { readFileSync } from "node:fs";

const F = "apps/frontend/src/components/dispatch/FilterBar.tsx";
const failures = [];
let s = "";
try { s = readFileSync(F, "utf8"); } catch { failures.push(`${F}: missing`); }

if (s) {
  if (!/from "\.\.\/\.\.\/components\/table"/.test(s)) {
    failures.push(`${F}: must reuse the shared table-controls (TableSearch/ColumnChooser) from components/table`);
  }
  if (!/TableSearch/.test(s)) failures.push(`${F}: slim toolbar must use the shared TableSearch`);
  if (!/filtersOpen/.test(s)) failures.push(`${F}: filters must collapse into a popover (filtersOpen), not the 196px stacked block`);
  // Double-outline fix: DatePicker must not be wrapped with its own border (box-in-box).
  if (/<DatePicker[^>]*className="[^"]*border /.test(s)) {
    failures.push(`${F}: DatePicker has a border className — double-outline (box-in-box) regression`);
  }
}

if (failures.length) {
  console.error("verify:dispatch-filter-toolbar — FAIL");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("verify:dispatch-filter-toolbar — OK (slim shared toolbar; no 196px block; no date double-outline)");
