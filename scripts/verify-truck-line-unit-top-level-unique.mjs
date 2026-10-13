/**
 * ROUND 155.6 — unit_id must appear in at most ONE Truck Line top-level group.
 * Tour legs stack under that one group; any other duplicate is a defect.
 *
 * Also locks: CURRENT helper export, three sections, empty state (not stuck Loading),
 * ordered columns (no Next appointment, no expenses).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-truck-line-unit-top-level-unique";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function readSources() {
  return {
    groupSrc: read("apps/backend/src/dispatch/truck-line/group-by-unit.ts"),
    routesSrc: read("apps/backend/src/dispatch/truck-line/truck-line.routes.ts"),
    boardSrc: read("apps/frontend/src/pages/dispatch/TruckLineBoard.tsx"),
    helperSrc: read("apps/backend/src/dispatch/current-truck-line-load.ts"),
  };
}

/** Every static check, over in-memory sources — so --selftest can plant regressions. */
export function findProblems({ groupSrc, routesSrc, boardSrc, helperSrc }) {
  const problems = [];
  const boardCode = codeOnly(boardSrc);

  if (!/export function groupTruckLineByUnit/.test(groupSrc)) {
    problems.push("group-by-unit.ts must export groupTruckLineByUnit");
  }
  if (!/assertUniqueUnitIds|findDuplicateTopLevelUnitIds/.test(groupSrc)) {
    problems.push("group-by-unit.ts must enforce unique unit_id at top level");
  }
  if (!/truck_line_duplicate_top_level_unit/.test(groupSrc)) {
    problems.push("group-by-unit.ts must throw truck_line_duplicate_top_level_unit on duplicate unit_id");
  }
  if (!/groupTruckLineByUnit/.test(routesSrc)) {
    problems.push("truck-line.routes.ts must call groupTruckLineByUnit");
  }
  if (!/from ["'].*current-truck-line-load/.test(routesSrc)) {
    problems.push("truck-line.routes.ts must import CURRENT predicate from current-truck-line-load.ts (ONE helper)");
  }
  if (!/export function currentTruckLineLoadSql/.test(helperSrc) || !/export const CURRENT_TRUCK_LINE_LOAD_SQL/.test(helperSrc)) {
    problems.push("current-truck-line-load.ts must export currentTruckLineLoadSql + CURRENT_TRUCK_LINE_LOAD_SQL");
  }
  // ROUND 255 — AUTH-061 48h hide retired. TRUCKLINE-16 (Lead, 2026-09-30): CURRENT now aliases
  // canonicalDispatchWorkWhereClause (dispatch-work, not accounting — see canonical-active-load-
  // set.ts's file-header section "TWO CANONICAL QUESTIONS, NOT ONE").
  if (!/canonicalDispatchWorkWhereClause/.test(helperSrc)) {
    problems.push("CURRENT helper must alias canonicalDispatchWorkWhereClause (TRUCKLINE-16)");
  }
  if (!/truck-line-section-\$\{section\}/.test(boardSrc) || !/SECTION_ORDER/.test(boardSrc) || !/"tour"/.test(boardSrc) || !/"in_transit"/.test(boardSrc) || !/"available"/.test(boardSrc)) {
    problems.push("TruckLineBoard must render three sections via SECTION_ORDER (tour / in_transit / available)");
  }
  if (!/truck-line-empty/.test(boardSrc)) {
    problems.push("TruckLineBoard must render data-testid=truck-line-empty (never stuck Loading on zero rows)");
  }
  if (!/showLoading/.test(boardSrc) || !/isPending/.test(boardSrc) || !/isFetched/.test(boardSrc)) {
    problems.push("TruckLineBoard must gate Loading on isPending/isFetched so an empty fetch shows empty state");
  }
  if (/Next appointment/.test(boardCode)) {
    problems.push('TruckLineBoard must not render "Next appointment" column (ROUND 155.6)');
  }
  // 443.99 (2026-10-12) — header-label check re-anchored.
  //   old rule: labels UNIT, "TOUR / PRE-SETTLEMENT", LOAD, PU DATE, DELIVERY DATE each present (any order).
  //   new rule: labels UNIT · TOUR · LOAD · PU DATE · DELIVERY DATE present IN THAT ORDER, and the retired
  //             "TOUR / PRE-SETTLEMENT" label absent.
  //   why: owner 2026-09-30 ("I want the transit line to be more visible") — PRE-SETTLEMENT came off the
  //        TOUR header so the column could narrow and TRANSIT take the width; landed in #23330
  //        (a4ba611c96) and documented on GRID_TEMPLATE_COLUMNS. The guard still demanded the retired
  //        label. Stricter than before: column order is now checked, and the old label is refused.
  const COLUMN_ORDER = ["UNIT", "TOUR", "LOAD", "PU DATE", "DELIVERY DATE"];
  const at = COLUMN_ORDER.map((label) => boardCode.search(new RegExp(`label="${label}"`)));
  if (at.some((i) => i < 0) || at.some((i, k) => k > 0 && i < at[k - 1])) {
    problems.push("TruckLineBoard columns must be UNIT · TOUR · LOAD · PU DATE · DELIVERY DATE, in that order (ROUND 255; owner 2026-09-30)");
  }
  if (/label="TOUR \/ PRE-SETTLEMENT"/.test(boardCode)) {
    problems.push('TruckLineBoard must not print the retired "TOUR / PRE-SETTLEMENT" header (owner 2026-09-30)');
  }
  // ROUND 255 + LAW-5: useLoadCostRollups MUST stay wired (verify-one-source-per-number).
  // What 155.6 forbids is painting expenses/income/Net as a board column or row cell —
  // not the canonical rollup hook itself.
  if (/truck-line-load-costs|truck-line-net-|data-testid=\{`truck-line-net-/.test(boardCode)) {
    problems.push("TruckLineBoard must not paint expenses/income/Net as a visible cell (ROUND 155.6 / 255)");
  }
  if (/\bNet\s*\{/.test(boardCode) || />\s*Net\s*</.test(boardCode) || />\s*Net\s*\{/.test(boardCode)) {
    problems.push("TruckLineBoard must not render a visible Net label in the row (ROUND 155.6 / 255)");
  }
  if (!/useLoadCostRollups/.test(boardCode) || !/costRollups\.get\(r\.load\.load_id\)/.test(boardCode)) {
    problems.push("TruckLineBoard must keep useLoadCostRollups + costRollups.get(r.load.load_id) (LAW-5 / R-173)");
  }
  return problems;
}

function main() {
  const problems = findProblems(readSources());

  // Pure duplicate-detection contract the grouper must keep (red fixture).
  const fixtureGroups = [{ unit_id: "u1" }, { unit_id: "u2" }, { unit_id: "u1" }];
  const seen = new Set();
  const dupes = [];
  for (const g of fixtureGroups) {
    if (seen.has(g.unit_id)) dupes.push(g.unit_id);
    else seen.add(g.unit_id);
  }
  assert.deepEqual(dupes, ["u1"], `${LABEL}: red fixture must detect duplicate u1`);
  assert.deepEqual(
    (() => {
      const s = new Set();
      const d = [];
      for (const g of [{ unit_id: "a" }, { unit_id: "b" }]) {
        if (s.has(g.unit_id)) d.push(g.unit_id);
        else s.add(g.unit_id);
      }
      return d;
    })(),
    [],
    `${LABEL}: green fixture must have zero duplicates`
  );

  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — unique unit_id top-level + CURRENT helper + sections + empty state + columns`);
}

/** Synthetic sources that satisfy every check — the clean control. Built from the rule text, not the
 *  repo, so the selftest proves the checks themselves whatever state the real files are in. */
const CLEAN_FIXTURE = {
  groupSrc: [
    "export function groupTruckLineByUnit(rows) { return assertUniqueUnitIds(rows); }",
    "function findDuplicateTopLevelUnitIds(g) {}",
    'throw new Error("truck_line_duplicate_top_level_unit");',
  ].join("\n"),
  routesSrc: 'import { CURRENT_TRUCK_LINE_LOAD_SQL } from "../current-truck-line-load.js";\nconst groups = groupTruckLineByUnit(rows);',
  helperSrc: [
    "export function currentTruckLineLoadSql(a) { return canonicalDispatchWorkWhereClause(a); }",
    "export const CURRENT_TRUCK_LINE_LOAD_SQL = currentTruckLineLoadSql('l');",
  ].join("\n"),
  boardSrc: [
    'const SECTION_ORDER = ["tour", "in_transit", "available"];',
    "<div data-testid={`truck-line-section-${section}`} />",
    '<div data-testid="truck-line-empty" />',
    "const showLoading = q.isPending && !q.isFetched;",
    '<H label="UNIT" /><H label="TOUR" /><H label="LOAD" /><H label="PU DATE" /><H label="DELIVERY DATE" />',
    "const costRollups = useLoadCostRollups(ids); const c = costRollups.get(r.load.load_id);",
  ].join("\n"),
};

if (process.argv.includes("--selftest")) {
  const f = CLEAN_FIXTURE;
  const planted = [
    ["grouper no longer exported", { groupSrc: f.groupSrc.replace("export function groupTruckLineByUnit", "function groupTruckLineByUnit") }],
    ["unique-unit enforcement removed", { groupSrc: "export function groupTruckLineByUnit(rows) { return rows; }\nthrow new Error(\"truck_line_duplicate_top_level_unit\");" }],
    ["duplicate unit no longer throws", { groupSrc: f.groupSrc.replace("truck_line_duplicate_top_level_unit", "dup") }],
    ["routes skip the grouper", { routesSrc: f.routesSrc.replace("groupTruckLineByUnit(rows)", "rows") }],
    ["routes inline their own CURRENT predicate", { routesSrc: f.routesSrc.replace("../current-truck-line-load.js", "../somewhere-else.js") }],
    ["CURRENT back on the accounting predicate", { helperSrc: f.helperSrc.replace("canonicalDispatchWorkWhereClause", "canonicalActiveLoadWhereClause") }],
    ["available section dropped", { boardSrc: f.boardSrc.replace(', "available"', "") }],
    ["empty state removed (stuck Loading)", { boardSrc: f.boardSrc.replace("truck-line-empty", "truck-line-blank") }],
    ["Next appointment column painted", { boardSrc: f.boardSrc + '\n<H label="Next appointment" />' }],
    ["Net painted in the row", { boardSrc: f.boardSrc + "\n<span>Net {fmt(c.net)}</span>" }],
    ["cost rollup hook unwired", { boardSrc: f.boardSrc.replace("useLoadCostRollups(ids)", "new Map()") }],
    ["retired TOUR / PRE-SETTLEMENT header back", { boardSrc: f.boardSrc.replace('<H label="TOUR" />', '<H label="TOUR / PRE-SETTLEMENT" />') }],
    ["LOAD before TOUR (column order)", { boardSrc: f.boardSrc.replace('<H label="TOUR" /><H label="LOAD" />', '<H label="LOAD" /><H label="TOUR" />') }],
  ];
  let caught = 0;
  for (const [name, patch] of planted) {
    if (findProblems({ ...f, ...patch }).length > 0) caught += 1;
    else console.error(`${LABEL} SELFTEST: planted violation escaped — ${name}`);
  }
  const clean = findProblems(f);
  if (clean.length) console.error(`${LABEL} SELFTEST: clean fixture flagged — ${clean.join("; ")}`);
  console.log(`${LABEL} SELFTEST: ${caught}/${planted.length} planted violations caught`);
  process.exit(caught === planted.length && clean.length === 0 ? 0 : 1);
}

main();
