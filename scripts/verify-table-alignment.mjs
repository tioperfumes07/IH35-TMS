#!/usr/bin/env node
// GLOBAL-TABLE-ALIGNMENT guard (UX Block A, Jorge LOCKED option 2).
// Fails if:
//   1) the shared table components stop supporting per-column align (`align`/`numeric` + resolveAlign), or
//   2) a known numeric column (Drive / Shift / Break / Cycle hours) is centered instead of right-aligned
//      in the shared component path (i.e. its column def lost `numeric`/`align:"right"`).
// This is the static regression guard required by the constitution: every bug fix / locked decision
// gets a CI guard so it can't silently regress.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];
const fail = (m) => failures.push(m);

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    fail(`MISSING FILE: ${rel}`);
    return "";
  }
  return fs.readFileSync(abs, "utf8");
}

function must(rel, content, label, pattern) {
  if (!content) return;
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  if (!re.test(content)) fail(`${rel}: missing ${label}`);
}

// --- 1. Shared components must support per-column alignment, centralized in resolveAlign ---
const dataTable = read("apps/frontend/src/components/DataTable.tsx");
must("apps/frontend/src/components/DataTable.tsx", dataTable, "resolveAlign helper export", /export function resolveAlign/);
must("apps/frontend/src/components/DataTable.tsx", dataTable, "align prop on Column type", /align\?:\s*"left"\s*\|\s*"center"\s*\|\s*"right"/);
must("apps/frontend/src/components/DataTable.tsx", dataTable, "numeric prop on Column type", /numeric\?:\s*boolean/);
must("apps/frontend/src/components/DataTable.tsx", dataTable, "tabular-nums applied for numeric", /tabular-nums/);
must("apps/frontend/src/components/DataTable.tsx", dataTable, "right-align class wired", /text-right/);
// Default must be center (locked option 2). If someone flips the default, this asserts it's a deliberate edit.
must("apps/frontend/src/components/DataTable.tsx", dataTable, "default-center fallback", /\?\?\s*\(col\.numeric\s*\?\s*"right"\s*:\s*"center"\)/);

const headerCell = read("apps/frontend/src/components/table/TableHeaderCell.tsx");
must("apps/frontend/src/components/table/TableHeaderCell.tsx", headerCell, "resolveAlign import", /resolveAlign/);
must("apps/frontend/src/components/table/TableHeaderCell.tsx", headerCell, "align prop", /align\?:\s*"left"\s*\|\s*"center"\s*\|\s*"right"/);
must("apps/frontend/src/components/table/TableHeaderCell.tsx", headerCell, "numeric prop", /numeric\?:\s*boolean/);

const colChooser = read("apps/frontend/src/components/table/ColumnChooser.tsx");
must("apps/frontend/src/components/table/ColumnChooser.tsx", colChooser, "align on TableColumn", /align\?:\s*"left"\s*\|\s*"center"\s*\|\s*"right"/);
must("apps/frontend/src/components/table/ColumnChooser.tsx", colChooser, "numeric on TableColumn", /numeric\?:\s*boolean/);

// --- 2. Known numeric (HH:MM hours) columns must be marked numeric, not left to center ---
// Fleet Live HOS board (drives off the shared TableHeaderCell via column defs).
const fleet = read("apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx");
const FLEET_HOUR_KEYS = [
  ["drive_remaining_min", "Drive Rem"],
  ["window_remaining_min", "Shift Rem"],
  ["break_remaining_min", "Break Rem"],
  ["cycle_remaining_min", "Cycle Rem"],
];
for (const [key, human] of FLEET_HOUR_KEYS) {
  // The column object for this key must carry numeric: true (so header right-aligns; centered = fail).
  const re = new RegExp(`key:\\s*"${key}"[^}]*numeric:\\s*true`);
  if (!re.test(fleet)) {
    fail(`FleetHosBoardSection: "${human}" (${key}) column must be marked numeric:true (right-aligned), not centered`);
  }
}
// The shared header must receive the alignment, or the header won't follow the data.
must("apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx", fleet, "numeric passed to TableHeaderCell", /numeric=\{c\.numeric\}/);

// Compliance HOS Tracker (local table — numeric HH:MM headers must be right-aligned to match data).
const hos = read("apps/frontend/src/pages/compliance/HosTrackerSection.tsx");
for (const label of ["Drive", "Shift", "Cycle"]) {
  const re = new RegExp(`label:\\s*"${label}",\\s*numeric:\\s*true`);
  if (!re.test(hos)) {
    fail(`HosTrackerSection: "${label}" header must be numeric:true (right-aligned) to match its tabular-nums data cell`);
  }
}
must("apps/frontend/src/pages/compliance/HosTrackerSection.tsx", hos, "numeric headers right-aligned", /h\.numeric\s*\?\s*"text-right tabular-nums"/);

if (failures.length) {
  console.error("verify-table-alignment: FAIL");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("verify-table-alignment: OK (shared per-column align supported; numeric hour columns right-aligned)");
