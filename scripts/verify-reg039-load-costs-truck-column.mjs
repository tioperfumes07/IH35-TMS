#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["connectivity"],"leafRe":"^dispatch\\.parity\\.load_costs$","task":"REG-039-TRUCK-COLUMN"} */
/**
 * REG-039 — Approximate load costs (Dispatch Home) has a sortable Truck/unit column.
 */
import { readFileSync } from "node:fs";

const PANEL = "apps/frontend/src/components/dispatch/DispatchLoadCostsPanel.tsx";
const BOARD = "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx";

function check(panel, board) {
  const errors = [];
  // Stale since the wizard columns landed (SortKey gained "line_haul"); the contract is only that "unit" is a sort key.
  if (!/type SortKey = [^;]*"unit"/.test(panel)) {
    errors.push("DispatchLoadCostsPanel SortKey must include unit");
  }
  // 443.100 class B (verify-table-header-and-date-column hand-rolled <table> ratchet).
  //   old rule: the panel's hand-rolled <table> renders headerBtn("unit", "Truck").
  //   new rule: the panel's ParityTable has a { key: "unit", label: "Truck" } column that is not sortable:false,
  //             and header clicks reach the panel's own comparator (onSortChange -> clickSort, sortMode external).
  //   why: the table law sends every list through the shared ParityTable; headerBtn was the hand-rolled header.
  //        Same contract: a Truck header that sorts by assigned_unit_number.
  // Column may be multi-line (U29 EntityLink render). Require key+label present and not sortable:false.
  const hasTruckCol = /key:\s*"unit"[\s\S]{0,80}label:\s*"Truck"/.test(panel) || /key:\s*"unit",\s*label:\s*"Truck"/.test(panel);
  if (!hasTruckCol || /key:\s*"unit"[\s\S]{0,200}sortable:\s*false/.test(panel) || !/onSortChange=\{\(key\) => clickSort\(key as SortKey\)\}/.test(panel)) {
    errors.push("Approximate load costs must expose a sortable Truck header");
  }
  // U29 (2026-11-02): Truck cell EntityLinks the unit when assigned_unit_id is present.
  // Still requires assigned_unit_number as the visible label + Unassigned when no unit.
  if (!/assigned_unit_number/.test(panel) || !/Unassigned/.test(panel)) {
    errors.push("Truck cells must render assigned_unit_number (EntityLink label or plain) with Unassigned fallback");
  }
  if (!/kind="unit"/.test(panel) || !/assigned_unit_id/.test(panel)) {
    errors.push("Truck cells must EntityLink kind=unit via assigned_unit_id (U29)");
  }
  if (!/sortKey === "unit"/.test(panel)) {
    errors.push("clicking Truck must sort by assigned_unit_number");
  }
  if (!/testId: "col-unit"/.test(board) || !/sortable: true/.test(board)) {
    errors.push("Load Costs board Unit column must remain sortable");
  }
  return errors;
}

function selftest() {
  const panel = readFileSync(PANEL, "utf8");
  const board = readFileSync(BOARD, "utf8");
  const good = check(panel, board);
  if (good.length) {
    console.error("SELFTEST FAIL — clean:\n  " + good.join("\n  "));
    process.exit(1);
  }
  const plantSortable = panel.replace(/key:\s*"unit",\s*\n\s*label:\s*"Truck"/, 'key: "unit",\n              label: "Truck",\n              sortable: false');
  const plantLabel = panel.replace(/label:\s*"Truck"/, 'label: "Unit"');
  if (check(plantSortable, board).length === 0 || check(plantLabel, board).length === 0) {
    console.error("SELFTEST FAIL — Truck header mutation not caught");
    process.exit(1);
  }
  console.log("PASS verify-reg039-load-costs-truck-column --selftest");
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = check(readFileSync(PANEL, "utf8"), readFileSync(BOARD, "utf8"));
if (errors.length) {
  console.error("FAIL verify-reg039-load-costs-truck-column:\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log("PASS verify-reg039-load-costs-truck-column");
