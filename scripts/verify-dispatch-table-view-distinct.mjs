#!/usr/bin/env node
/**
 * DISPATCH Table view (owner 2026-09-04: "THE TABLE VIEW DOES NOT RENDER ANYTHING"). List and Table
 * board-modes both routed through renderListOrTable(), so the Table toggle was dead — identical
 * grouped output. Table is now the DISTINCT flat view: every load/truck in ONE spreadsheet grid
 * (boardSections flat-mapped), one global sort, one pager. This guard fails if Table collapses back
 * into the grouped List render.
 *
 * Self-testing static guard. Run: node scripts/verify-dispatch-table-view-distinct.mjs [--selftest]
 */
import fs from "node:fs";

const file = "apps/frontend/src/pages/dispatch/DispatchBoard.tsx";
const original = fs.readFileSync(file, "utf8");

const contracts = [
  [
    'board-mode "table" routes to renderTable(), not renderListOrTable()',
    (s) => /boardMode === "table"\s*\?\s*renderTable\(\)/.test(s),
    (s) => s.replace(/boardMode === "table"\s*\?\s*renderTable\(\)/, "false\n          ? renderTable()"),
  ],
  [
    "renderTable exists and renders a distinct flat table grid",
    (s) => /const renderTable = \(\) =>/.test(s) && /tableTestId="dispatch-board-flat-table"/.test(s),
    (s) => s.replace('tableTestId="dispatch-board-flat-table"', 'tableTestId="dispatch-board-section-table-x"'),
  ],
  [
    "the flat table concatenates every section (boardSections.flatMap), not one section",
    (s) => /const renderTable[\s\S]*?boardSections\.flatMap\(/.test(s),
    (s) => s.replace(/boardSections\.flatMap\(/, "[].map("),
  ],
  [
    "the flat table uses one global sort (tableSort), distinct from per-section sorts",
    (s) => /const \[tableSort, setTableSort\] = useState/.test(s) && /onSortChange=\{\(key, direction\) => setTableSort\(/.test(s),
    (s) => s.replace("const [tableSort, setTableSort] = useState", "const [tableSortX, setTableSort] = useState"),
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
