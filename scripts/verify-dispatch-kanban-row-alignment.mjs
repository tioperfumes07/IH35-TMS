#!/usr/bin/env node
// KANBAN-SWIM-LANE guard (owner 2026-09-11): statically assert the Dispatch Kanban board uses a
// board-wide, unit-derived row model — NOT a per-column-local-index row model. The swim-lane
// invariant is: one row per UNIT, computed once across the whole board; each unit's card renders
// in whichever lane matches its current load's status; every OTHER lane on that same row is empty
// space at that row's height. The row key must be unit-derived (assigned_unit_id or load id for
// unassigned), NOT column-local-index-derived — so the same unit is always at the same vertical
// position no matter which lane it's currently in.
//
// This is a STATIC guard (no DB, no browser). It reads the component source and asserts:
//   1. A board-wide unit-row computation exists (computeAllUnits / allUnits).
//   2. The row key is unit-derived (uses unitKey / assigned_unit_id / unit: prefix), not a column
//      array index.
//   3. The swim-lane column renders its own cards FROM the board-wide rows (board sort order).
//   4. LEAD 443.251 item 3 (owner-live 2026-10-22, "a large blank gap under card T152/13700 in
//      Dispatched"): NO empty placeholder rows. The 09-11 alignment placeholders left a tall blank
//      hole between two cards of the same lane (measured: 2 × 64 px under T152). Superseded.
//   5. The old per-column KanbanDispatchColumn is NOT used for the main board render.
//   6. handleDragEnd is untouched (not modified for layout).
//   7. The row key attribute (data-kanban-swim-lane-row-key) is present on both card rows and empty rows.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const KANBAN_FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/DispatchKanban.tsx");

if (!fs.existsSync(KANBAN_FILE)) {
  console.error(`verify-dispatch-kanban-row-alignment: FAIL — ${KANBAN_FILE} not found`);
  process.exit(1);
}

const src = fs.readFileSync(KANBAN_FILE, "utf8");

/** Every swim-lane row-alignment rule over the DispatchKanban source; returns what passed and what failed. */
export function audit(src) {
  const failures = [];
  const passes = [];

  function check(label, cond, detail) {
    if (cond) {
      passes.push(label);
    } else {
      failures.push(label + (detail ? ` — ${detail}` : ""));
    }
  }

  // 1. Board-wide unit-row computation exists
  check(
    "computeAllUnits function defined",
    /function computeAllUnits\s*\(/.test(src),
  );

  check(
    "UnitRow type defined",
    /type UnitRow\s*=/.test(src),
  );

  check(
    "sortAllUnits function defined",
    /function sortAllUnits\s*\(/.test(src),
  );

  check(
    "allUnits useMemo computes board-wide rows",
    /const allUnits\s*=\s*useMemo\(\s*\(\)\s*=>\s*sortAllUnits\(\s*computeAllUnits\(/.test(src),
  );

  // 2. Row key is unit-derived — the UnitRow.unitKey field is derived from unit id or load id
  //    (search the whole source since the function body has nested braces)
  check(
    "UnitRow.unitKey uses unit: prefix for awaiting trucks",
    /unitKey:\s*`unit:\$\{[^}]+\}`/.test(src),
    "awaiting truck rows must use unit:<id> as the row key",
  );
  check(
    "UnitRow.unitKey uses assigned_unit_id or load id for real loads",
    /unitKey:\s*(unitId\s*\?\?\s*`load:\$\{load\.id\}`|`load:\$\{load\.id\}`)/.test(src)
    || /const key\s*=\s*unitId\s*\?\?\s*`load:\$\{load\.id\}`/.test(src)
    // 2098b6968a (Lead #23311, measured live 2026-09-30): a unit's SECOND leg keeps its own row, keyed unit + load id,
    // aligned under its sibling — still unit-derived; unassigned loads stay load:<id>.
    || (/const key\s*=\s*unitId\s*\?\s*`unit:\$\{unitId\}:load:\$\{load\.id\}`\s*:\s*`load:\$\{load\.id\}`/.test(src) && /unitKey:\s*key\b/.test(src)),
    "real load rows must use assigned_unit_id (or load:<id> for unassigned) as the row key",
  );
  check(
    "computeAllUnits deduplicates by unit id (seenUnits set)",
    /seenUnits/.test(src),
    "must deduplicate so one unit = one row",
  );

  // 3. Swim-lane column renders ALL unit rows (not just its own lane's loads)
  check(
    "KanbanSwimLaneColumn component defined",
    /function KanbanSwimLaneColumn\s*\(/.test(src),
  );

  // Search the whole source for these patterns (the function body has nested braces
  // so a naive regex match would stop at the first closing brace)
  check(
    "KanbanSwimLaneColumn accepts allUnits prop",
    /allUnits:\s*UnitRow\[\]/.test(src),
  );
  check(
    "KanbanSwimLaneColumn draws its own cards from the board-wide rows (board sort order)",
    /const visibleUnits\s*=\s*allUnits\.filter\(\(unit\)\s*=>\s*unit\.columnKey === column\.key\)/.test(src) && /visibleUnits\.map\(/.test(src),
  );
  check(
    "No empty placeholder rows (LEAD 443.251 item 3 — blank gap under T152)",
    !/data-kanban-swim-lane-empty/.test(src) && !/unit\.columnKey\s*!==\s*column\.key/.test(src),
  );
  check(
    "Card rows carry data-kanban-swim-lane-row-key",
    /data-kanban-swim-lane-row-key=\{unit\.unitKey\}/.test(src),
  );
  check(
    "Row min-height enforced via SWIM_LANE_ROW_MIN_HEIGHT",
    /SWIM_LANE_ROW_MIN_HEIGHT/.test(src),
  );
  check(
    "Row key in .map() is unit-derived (unit.unitKey), not column-local index",
    /key=\{unit\.unitKey\}/.test(src) || /key=\{`empty:\$\{unit\.unitKey\}:\$\{column\.key\}`\}/.test(src),
  );

  // 4. The main board render uses KanbanSwimLaneColumn, not the old KanbanDispatchColumn
  const boardRenderMatch = src.match(/data-testid="kanban-swim-lane-board"[\s\S]*?<\/div>/);
  check(
    'Board render container has data-testid="kanban-swim-lane-board"',
    /data-testid="kanban-swim-lane-board"/.test(src),
  );

  check(
    "Board render uses KanbanSwimLaneColumn (not KanbanDispatchColumn) for main lanes",
    /<KanbanSwimLaneColumn[\s\S]*?allUnits=\{allUnits\}/.test(src),
  );

  // 5. The old per-column sort is NOT used for the main board (board-wide sort replaces it)
  check(
    "Board-wide boardSort state exists",
    /const \[boardSort, setBoardSort\]/.test(src),
  );

  check(
    "toggleKanbanColumnSort routes board columns to boardSort (not per-column)",
    /setBoardSort\(/.test(src),
  );

  // 6. handleDragEnd is present and not removed (untouched transition logic)
  check(
    "handleDragEnd async function present",
    /const handleDragEnd\s*=\s*async\s*\(\s*event:\s*DragEndEvent\s*\)/.test(src),
  );

  // 7. No column-local array index used as a React key in the swim-lane render
  //    (the old pattern was key={load.id} from a per-column sorted array; the new pattern
  //    is key={unit.unitKey} from the shared allUnits array)
  check(
    "Swim-lane .map() does NOT use a column-local index as key",
    !/key=\{i\}/.test(src) && !/key=\{index\}/.test(src),
  );
  check(
    "Swim-lane .map() uses unit-derived key",
    /key=\{unit\.unitKey\}/.test(src) || /key=\{`empty:\$\{unit\.unitKey\}/.test(src),
  );

  // 8. Per-density row min-heights defined for alignment
  check(
    "SWIM_LANE_ROW_MIN_HEIGHT has compact entry",
    /SWIM_LANE_ROW_MIN_HEIGHT[\s\S]*?compact:\s*\d+/.test(src),
  );
  check(
    "SWIM_LANE_ROW_MIN_HEIGHT has standard entry",
    /SWIM_LANE_ROW_MIN_HEIGHT[\s\S]*?standard:\s*\d+/.test(src),
  );
  check(
    "SWIM_LANE_ROW_MIN_HEIGHT has detailed entry",
    /SWIM_LANE_ROW_MIN_HEIGHT[\s\S]*?detailed:\s*\d+/.test(src),
  );
  return { failures, passes };
}

// A minimal DispatchKanban that holds every rule — the selftest's known-good input (the real file is judged on the
// normal path; the selftest proves the rules themselves catch each planted regression).
export const SYNTHETIC_OK = [
  "type UnitRow = { unitKey: string; columnKey: string };",
  "const SWIM_LANE_ROW_MIN_HEIGHT = { compact: 40, standard: 64, detailed: 96 };",
  "function computeAllUnits(loads) { const seenUnits = new Set(); const key = unitId ?? `load:${load.id}`; return [{ unitKey: `unit:${u.id}` }]; }",
  "function sortAllUnits(rows) { return rows; }",
  "const allUnits = useMemo(() => sortAllUnits(computeAllUnits(loads)), [loads]);",
  "const [boardSort, setBoardSort] = useState(null); function toggleKanbanColumnSort() { setBoardSort(null); }",
  "const handleDragEnd = async (event: DragEndEvent) => {};",
  "function KanbanSwimLaneColumn({ column, allUnits }: { column: Col; allUnits: UnitRow[] }) {",
  "  const visibleUnits = allUnits.filter((unit) => unit.columnKey === column.key);",
  "  return visibleUnits.map((unit) => <div key={unit.unitKey} data-kanban-swim-lane-row-key={unit.unitKey} />);",
  "}",
  '<div data-testid="kanban-swim-lane-board"><KanbanSwimLaneColumn column={c} allUnits={allUnits} /></div>',
].join("\n");

// The 09-11/09-12 shape this guard used to require: a board-wide slice WITH empty placeholder rows.
const PLACEHOLDER_SHAPE = SYNTHETIC_OK.replace(
  "  return visibleUnits.map((unit) => <div key={unit.unitKey} data-kanban-swim-lane-row-key={unit.unitKey} />);",
  "  return visibleUnits.map((unit) => unit.columnKey !== column.key ? <div data-kanban-swim-lane-empty /> : <div key={unit.unitKey} data-kanban-swim-lane-row-key={unit.unitKey} />);",
);

if (process.argv.includes("--selftest")) {
  const ok = SYNTHETIC_OK;
  const cases = [
    ["a DispatchKanban holding every rule passes", audit(ok).failures.length === 0],
    ["a column-local index key fails", audit(ok + "\n<div key={i} />").failures.length > 0],
    ["rows not deduplicated board-wide fail", audit(ok.split("seenUnits").join("x")).failures.length > 0],
    ["an empty placeholder row (the T152 gap) fails", audit(PLACEHOLDER_SHAPE).failures.length > 0],
    ["losing the per-unit row key fails", audit(ok.split("data-kanban-swim-lane-row-key={unit.unitKey}").join("x")).failures.length > 0],
    ["per-column sort instead of board sort fails", audit(ok.split("setBoardSort(").join("setColumnSort(")).failures.length > 0],
    // 443.187 — the current shapes pass, and a column-local filter in place of the board-wide slice still fails.
    ["the second-leg unit+load key passes", audit(ok.replace("const key = unitId ?? `load:${load.id}`;", "const key = unitId ? `unit:${unitId}:load:${load.id}` : `load:${load.id}`; rows.push({ unitKey: key });")).failures.length === 0],
    ["a lane drawn from a column-local array instead of the board-wide rows fails", audit(ok.replace("allUnits.filter((unit) => unit.columnKey === column.key)", "columnLoads")).failures.length > 0],
  ];
  for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? "verify-dispatch-kanban-row-alignment --selftest FAIL" : `verify-dispatch-kanban-row-alignment --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const { failures, passes } = audit(src);

// Report
console.log(`verify-dispatch-kanban-row-alignment: ${passes.length} checks passed`);
for (const p of passes) console.log(`  ✓ ${p}`);

if (failures.length > 0) {
  console.error(`verify-dispatch-kanban-row-alignment: FAIL — ${failures.length} check(s) failed`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log("verify-dispatch-kanban-row-alignment: OK — row keys are unit-derived, rows computed board-wide, no blank placeholder rows");
process.exit(0);
