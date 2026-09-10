#!/usr/bin/env node
/**
 * DISPATCH Table view.
 *
 * (owner 2026-09-04: "THE TABLE VIEW DOES NOT RENDER ANYTHING") — List and Table board-modes both
 * routed through renderListOrTable(), so the Table toggle was dead. Table became the DISTINCT flat
 * view: every load/truck flat-mapped from boardSections, one global sort, one pager.
 *
 * EXTENDED — REG-019 (owner 2026-09-09: "IN DISPATCH IN LISTS, THEN TABLE, THE ASSIGNED AND UNASSIGNED
 * UNITS ARE TOGETHER, THEY ARE EACH SUPPOSED TO HAVE THEIR OWN WINDOW. AND MOVE AUTOMATICALLY FROM ONE
 * TO THE OTHER"). The one flat grid is now split into TWO labeled windows — "Assigned Units" and
 * "Unassigned Units" — partitioning the SAME sortedRows by a single predicate so nothing is dropped and
 * a row moves between panels automatically when the underlying queries refetch. This guard fails if:
 *   - Table collapses back into the grouped List render (the original regression), OR
 *   - the two-panel split is removed / a panel loses its labeled window, OR
 *   - the partition stops being a strict complement (would silently drop rows from the Table view).
 *
 * Checks are scoped to the renderTable() body so they cannot be satisfied by the Assignment sub-view,
 * which happens to use the same "Assigned Units" / "Unassigned Units" band titles.
 *
 * Self-testing static guard. Run: node scripts/verify-dispatch-table-view-distinct.mjs [--selftest]
 */
import fs from "node:fs";

const file = "apps/frontend/src/pages/dispatch/DispatchBoard.tsx";
const original = fs.readFileSync(file, "utf8");

// Slice out just the renderTable() body so "Assigned Units" band-title checks can't be satisfied by
// the Assignment sub-view (renderAssignmentView) which shares those labels.
function renderTableBlock(s) {
  const start = s.indexOf("const renderTable = () =>");
  const end = s.indexOf("const renderAssignmentView", start);
  return start >= 0 && end > start ? s.slice(start, end) : "";
}

const contracts = [
  [
    'board-mode "table" routes to renderTable(), not renderListOrTable()',
    (s) => /boardMode === "table"\s*\?\s*renderTable\(\)/.test(s),
    (s) => s.replace(/boardMode === "table"\s*\?\s*renderTable\(\)/, "false\n          ? renderTable()"),
  ],
  [
    "the table flat-maps every section (boardSections.flatMap), so both panels together drop no rows",
    (s) => /const renderTable[\s\S]*?boardSections\.flatMap\(/.test(s),
    (s) => s.replace(/boardSections\.flatMap\(/, "[].map("),
  ],
  [
    "the table uses one global sort (tableSort), distinct from per-section sorts",
    (s) => /const \[tableSort, setTableSort\] = useState/.test(s) && /onSortChange=\{\(key, direction\) => setTableSort\(/.test(s),
    (s) => s.replace("const [tableSort, setTableSort] = useState", "const [tableSortX, setTableSort] = useState"),
  ],
  [
    'REG-019: renderTable renders both unit-panel grids (dispatch-board-table-assigned + -unassigned)',
    (s) => {
      const b = renderTableBlock(s);
      return (
        /tableTestId=\{tableTestId\}/.test(b) &&
        /"dispatch-board-table-assigned"/.test(b) &&
        /"dispatch-board-table-unassigned"/.test(b)
      );
    },
    (s) => s.replace("tableTestId={tableTestId}", 'tableTestId="dispatch-board-flat-table"'),
  ],
  [
    'REG-019: both panels are their own labeled window (AssignmentBand "Assigned Units" + "Unassigned Units")',
    (s) => {
      const b = renderTableBlock(s);
      return /title="Assigned Units"/.test(b) && /title="Unassigned Units"/.test(b);
    },
    (s) => {
      const b = renderTableBlock(s);
      const mutatedBlock = b.replace('title="Assigned Units"', 'title="Units"');
      return s.replace(b, mutatedBlock);
    },
  ],
  [
    // REG-019 kept its intent (a labeled Assigned + Unassigned window, rows move automatically), but
    // REG-035 (owner 2026-09-10: "a truck appears twice with two loads") supersedes the old strict
    // "no row dropped" rule for the ASSIGNED panel: each unit shows exactly its ONE current load via
    // currentLoadPerUnit(), and Unassigned is the complement MINUS anything already shown in Assigned
    // (so a row is never double-shown, and a collapsed trailing billing-queue load is not re-surfaced).
    "REG-019/REG-035: Assigned = one current load per unit; Unassigned = complement, none double-shown",
    (s) => {
      const b = renderTableBlock(s);
      return (
        /const assignedRows = currentLoadPerUnit\(sortedRows\.filter\(isAssignedUnitRow\)\);/.test(b) &&
        /const assignedRowIds = new Set\(assignedRows\.map\(\(row\) => row\.id\)\);/.test(b) &&
        /const unassignedRows = sortedRows\.filter\(\s*\(row\) => !isAssignedUnitRow\(row\) && !assignedRowIds\.has\(row\.id\),?\s*\);/.test(b)
      );
    },
    (s) => s.replace(
      "(row) => !isAssignedUnitRow(row) && !assignedRowIds.has(row.id),",
      "(row) => !isAssignedUnitRow(row),",
    ),
  ],
];

function audit(s) {
  return contracts.filter(([, test]) => !test(s)).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`[verify-dispatch-table-view-distinct] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, , mutate] of contracts) {
    if (audit(mutate(original)).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`[verify-dispatch-table-view-distinct] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`);
  process.exit(0);
}

console.log("[verify-dispatch-table-view-distinct] OK");
