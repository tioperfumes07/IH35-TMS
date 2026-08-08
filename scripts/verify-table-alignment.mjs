#!/usr/bin/env node
// GLOBAL-TABLE-ALIGNMENT guard (UX Block A, Jorge LOCKED option 2).
// Fails if:
//   1) the shared table components stop supporting per-column align (`align`/`numeric` + resolveAlign), or
//   2) a known numeric column (Drive / Shift / Break / Cycle hours) is not right-aligned
//      in its shared component path (`numeric:true` in TableHeaderCell tables or matching
//      `className` + `cellClass` in ParityTable).
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
// Fleet Live HOS board (migrated to ParityTable; header + data alignment are column classes).
const fleet = read("apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx");
const FLEET_HOUR_KEYS = [
  ["drive_remaining_min", "Drive Rem"],
  ["window_remaining_min", "Shift Rem"],
  ["break_remaining_min", "Break Rem"],
  ["cycle_remaining_min", "Cycle Rem"],
];
for (const [key, human] of FLEET_HOUR_KEYS) {
  const start = fleet.indexOf(`key: "${key}"`);
  const end = start >= 0 ? fleet.indexOf("\n  },", start) : -1;
  const column = start >= 0 ? fleet.slice(start, end >= 0 ? end : start + 800) : "";
  if (!/className:\s*"text-right"/.test(column) || !/cellClass:\s*"text-right tabular-nums"/.test(column)) {
    fail(`FleetHosBoardSection: "${human}" (${key}) ParityTable header + cell must be right-aligned with tabular numerals`);
  }
}
must("apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx", fleet, "ParityTable import", /components\/parity\/ParityTable/);
must("apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx", fleet, "ParityTable usage", /<ParityTable\b/);

// Compliance HOS Tracker — numeric HH:MM headers must be right-aligned to match their data cells.
//
// STALE-ASSERTION FIX (2026-08-08): this block required `numeric: true` on each column and a
// `h.numeric ? "text-right tabular-nums"` renderer. Both belonged to the LOCAL table this section used to
// hand-roll. It has since migrated to the shared <ParityTable/>, whose `ParityColumn<T>` type has NO
// `numeric` field at all — so the guard demanded a prop that does not exist in the component API, and
// "fixing" it would have meant adding dead config (a TS excess property) to satisfy a checker.
//
// The intent was never in doubt: THIS FILE'S OWN HEADER already allows the ParityTable form —
// "`numeric:true` in TableHeaderCell tables OR matching `className` + `cellClass` in ParityTable". Only
// the assertion lagged the migration. The columns are, and were, right-aligned in both header and cell.
//
// ParityTable applies `column.className` to the <th> and `cellClass` to the <td>, so requiring BOTH to
// carry `text-right` is what actually proves header/data alignment parity — which is the locked outcome.
const hos = read("apps/frontend/src/pages/compliance/HosTrackerSection.tsx");
for (const label of ["Drive", "Shift", "Cycle"]) {
  // Grab the column object for this label and require right-alignment on the header AND the cell.
  const block = new RegExp(`label:\\s*"${label}"[\\s\\S]{0,320}?\\n\\s{6}\\}`).exec(hos);
  if (!block) {
    fail(`HosTrackerSection: column "${label}" not found — refusing to pass vacuously`);
    continue;
  }
  const hasHeaderRight = /className:\s*"[^"]*text-right/.test(block[0]);
  const hasCellRight = /cellClass:\s*"[^"]*text-right/.test(block[0]);
  if (!hasHeaderRight || !hasCellRight) {
    fail(
      `HosTrackerSection: "${label}" must be right-aligned on BOTH header (className) and cell (cellClass) ` +
        `to match its tabular-nums data — header:${hasHeaderRight} cell:${hasCellRight}`,
    );
  }
}

if (failures.length) {
  console.error("verify-table-alignment: FAIL");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("verify-table-alignment: OK (shared per-column align supported; numeric hour columns right-aligned)");
