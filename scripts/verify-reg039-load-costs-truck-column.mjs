#!/usr/bin/env node
/**
 * REG-039 — Approximate load costs (Dispatch Home) has a sortable Truck/unit column.
 */
import { readFileSync } from "node:fs";

const PANEL = "apps/frontend/src/components/dispatch/DispatchLoadCostsPanel.tsx";
const BOARD = "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx";

function check(panel, board) {
  const errors = [];
  if (!/type SortKey = "load" \| "unit" \| "revenue"/.test(panel)) {
    errors.push("DispatchLoadCostsPanel SortKey must include unit");
  }
  if (!/headerBtn\("unit", "Truck"\)/.test(panel)) {
    errors.push("Approximate load costs must expose a sortable Truck header");
  }
  if (!/assigned_unit_number \?\? "Unassigned"/.test(panel)) {
    errors.push("Truck cells must render assigned_unit_number");
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
  if (check(panel.replace('headerBtn("unit", "Truck")', 'headerBtn("load", "Load")'), board).length === 0) {
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
