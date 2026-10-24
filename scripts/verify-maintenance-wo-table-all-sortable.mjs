#!/usr/bin/env node
/**
 * Register row 154 / audit D035 (Lead 443.301): Active WOs — Load, Driver, Vendor, Bill, JE and Timing headers had no
 * sort button while adjacent headers did. Owner UI law 10-22: every table column sorts ascending/descending.
 * Asserts every column in WorkOrdersTable.tsx is sortable with a sortValue; --selftest plants a non-sortable column.
 */
import fs from "node:fs";
const LABEL = "verify-maintenance-wo-table-all-sortable";
const FILE = "apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx";
const REQUIRED = ["display_id", "source_type", "load_id", "driver_id", "resolved_vendor_id", "linked_bill_id", "linked_journal_entry_id", "status", "total_actual_cost", "opened_at", "work_started_at", "expected_release_at", "timing"];
export function check(src) {
  const v = [];
  if (/sortable:\s*false/.test(src)) v.push("a column is declared sortable: false");
  for (const k of REQUIRED) if (!new RegExp(`woSortValue\\(row, "${k}"\\)`).test(src)) v.push(`column ${k} has no sortValue via woSortValue`);
  return v;
}
const src = fs.readFileSync(FILE, "utf8");
if (process.argv.includes("--selftest")) {
  if (check(src).length) { console.error(`${LABEL} SELFTEST FAIL: clean source rejected: ${check(src).join("; ")}`); process.exit(1); }
  const plants = [
    ["driver unsortable", src.replace('sortValue: (row) => woSortValue(row, "driver_id"),', "sortable: false,")],
    ["timing unsortable", src.replace('woSortValue(row, "timing")', "0")],
  ];
  for (const [l, m] of plants) if (!check(m).length) { console.error(`${LABEL} SELFTEST FAIL: plant escaped — ${l}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length}/${plants.length}`); process.exit(0);
}
const v = check(src);
if (v.length) { console.error(`${LABEL}: FAIL\n  ${v.join("\n  ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — ${REQUIRED.length} of ${REQUIRED.length} Active WO columns sortable`);
