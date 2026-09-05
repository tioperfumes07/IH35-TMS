// MATRIX-BUILT-OPTIONAL — a text-rendering/regex assertion (Load# dash + unit-number display),
// not an EntityLink/FK/connectivity wiring ratchet the Program matrix's Box 3 auto-green needs.
import { readFileSync } from "node:fs";

const BOARD = "apps/frontend/src/pages/dispatch/DispatchBoard.tsx";
const ROUTES = "apps/backend/src/dispatch/loads.routes.ts";

function problems(board, routes) {
  const failures = [];
  const unitRow = board.match(/function unitToBoardRow\(unit: UnitsWithoutLoad\)[\s\S]*?\n\}/)?.[0] ?? "";
  const boardColumns = board.match(/const boardColumns:[\s\S]*?\n\s*\];/)?.[0] ?? "";
  const parityMap = board.match(/const\s+parityColumns[\s\S]*?boardColumns\.map\(\(column\)\s*=>\s*\(\{[\s\S]*?\}\)\)/)?.[0] ?? "";
  const loadCell = board.match(/function renderLoadNumberCell\([\s\S]*?\n\}/)?.[0] ?? "";
  const awaitingQuery = routes.match(/app\.get\("\/api\/v1\/dispatch\/units-without-load"[\s\S]*?\n\s*\}\);/)?.[0] ?? "";

  if (!/u\.unit_number/.test(awaitingQuery) || !/unit_number:\s*row\.unit_number/.test(awaitingQuery)) failures.push("API must return unit_number");
  if (!/assigned_unit_number:\s*unit\.unit_number/.test(unitRow)) failures.push("row must map unit_number");
  if (!/\{\s*key:\s*"unit",\s*header:\s*"Unit",\s*cell:\s*\(load\)\s*=>\s*renderUnitCell\(load\)\s*\}/.test(boardColumns)) failures.push("board must render Unit cell");
  // DESIGN-CONTRACT-DISPATCH-BOARD-2026-09-05 §A: no board column is ever hidden by default
  // (BRD-25's DEFAULT_VISIBLE_BOARD_KEYS allowlist was removed) — Unit is visible by default
  // exactly because nothing sets defaultHidden at all.
  if (!parityMap) failures.push("parityColumns mapping not found");
  else if (/defaultHidden\s*:/.test(parityMap)) failures.push("Unit must be visible by default (parityColumns must not set defaultHidden on any column)");
  // Dispatch board #17 (owner, 2026-09-04): Load# saying "Unassigned" duplicated the Status
  // column's own "Unassigned" pill on the same row -- "the dash in Load# is enough." Load# now
  // renders "—"; the invariant this guard protects (no raw synthetic unit: UUID, no broken
  // EntityLink) is unchanged.
  if (!/load\.id\.startsWith\("unit:"\)/.test(loadCell) || !/>—<\/span>/.test(loadCell)) failures.push("Load # must render — (not the Status pill's own \"Unassigned\" text again)");
  return failures;
}

function assertClean(board, routes, label = "source") {
  const failures = problems(board, routes);
  if (failures.length) throw new Error(`${label}: ${failures.join("; ")}`);
}

function selftest(board, routes) {
  const plants = [
    ["API return", board, routes.replace("unit_number: row.unit_number", "unit_number: null")],
    ["row mapping", board.replace("assigned_unit_number: unit.unit_number", "assigned_unit_number: null"), routes],
    ["Unit cell", board.replace('{ key: "unit", header: "Unit", cell: (load) => renderUnitCell(load) },', '{ key: "unit", header: "Unit", cell: () => null },'), routes],
    ["default visibility", board.replace("sortable: DISPATCH_SORTABLE_COLS.has(column.key),", "sortable: DISPATCH_SORTABLE_COLS.has(column.key), defaultHidden: column.key === \"unit\","), routes],
    ["synthetic load guard", board.replace('load.id.startsWith("unit:")', 'load.id.startsWith("never:")'), routes],
  ];
  let caught = 0;
  for (const [label, plantedBoard, plantedRoutes] of plants) {
    if (problems(plantedBoard, plantedRoutes).length > 0) caught += 1;
    else throw new Error(`selftest did not catch planted ${label} defect`);
  }
  assertClean(board, routes);
  console.log(`PASS verify-dispatch-awaiting-unit-number SELFTEST — ${caught}/${plants.length} planted defects caught`);
}

const board = readFileSync(BOARD, "utf8");
const routes = readFileSync(ROUTES, "utf8");
try {
  if (process.argv.includes("--selftest")) selftest(board, routes);
  else {
    assertClean(board, routes);
    console.log("PASS: awaiting-assignment rows show the canonical vehicle number and never a synthetic UUID");
  }
} catch (error) {
  console.error(`FAIL verify-dispatch-awaiting-unit-number: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
