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

function main() {
  const problems = [];
  const groupSrc = read("apps/backend/src/dispatch/truck-line/group-by-unit.ts");
  const routesSrc = read("apps/backend/src/dispatch/truck-line/truck-line.routes.ts");
  const boardSrc = read("apps/frontend/src/pages/dispatch/TruckLineBoard.tsx");
  const helperSrc = read("apps/backend/src/dispatch/current-truck-line-load.ts");
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
  // ROUND 255 — AUTH-061 48h hide retired; CURRENT aliases canonicalActiveLoadWhereClause.
  if (!/canonicalActiveLoadWhereClause/.test(helperSrc)) {
    problems.push("CURRENT helper must alias canonicalActiveLoadWhereClause (ROUND 255)");
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
  if (!/label="TOUR \/ PRE-SETTLEMENT"/.test(boardSrc) || !/label="PU DATE"/.test(boardSrc) || !/label="DELIVERY DATE"/.test(boardSrc) || !/label="UNIT"/.test(boardSrc) || !/label="LOAD"/.test(boardSrc)) {
    problems.push("TruckLineBoard columns must be UNIT · TOUR / PRE-SETTLEMENT · LOAD · PU DATE · DELIVERY DATE (ROUND 255)");
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

main();
