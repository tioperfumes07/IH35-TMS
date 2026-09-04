#!/usr/bin/env node
/**
 * Spec 09-04-2026-Claude-Coder-1-Load-Costs-Board-19-Columns.md §5.1: "asserts all 19 keys present,
 * in order, and that route_crew / costs / margin / category are gone."
 *
 * Deliberately narrower than verify-load-costs-board-manifest.mjs (which covers the board's whole
 * surface -- KPIs, honesty rules, R&M linkage, etc.). This guard checks ONE thing only: the column
 * contract itself, so a future manifest rewrite that accidentally drops a column still fails on this
 * dedicated, single-purpose file even if the broader manifest guard's own column check is edited away
 * at the same time.
 */
import fs from "node:fs";

const BOARD = "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx";

const COLUMN_ORDER = [
  "load", "unit", "driver-name", "pu-date", "del-date", "status", "revenue",
  "late-fee", "lumper", "fuel", "repairs-maintenance", "other",
  "short-miles", "rate-loaded", "loaded-pay", "empty-miles", "rate-empty", "deadhead-pay", "gross",
];

function violations(board) {
  const errors = [];
  const offsets = COLUMN_ORDER.map((id) => board.indexOf(`testId: "col-${id}"`));
  offsets.forEach((offset, index) => {
    if (offset < 0) errors.push(`missing column: ${COLUMN_ORDER[index]}`);
  });
  offsets.forEach((offset, index) => {
    if (index > 0 && offset >= 0 && offsets[index - 1] >= 0 && offset <= offsets[index - 1]) {
      errors.push(`column out of order at position ${index}: ${COLUMN_ORDER[index]}`);
    }
  });
  // Owner's exact removal list (§1): route_crew, costs, margin as a DEFAULT column, and Category.
  if (board.includes('testId: "col-route-crew"') || board.includes('testId: "col-costs"')) {
    errors.push("route_crew/costs column still declared -- owner removed both");
  }
  if (board.includes('testId: "col-category"') || board.includes('key: "category"')) {
    errors.push("a Category column exists -- owner explicitly removed it and forbade re-adding it");
  }
  // Margin may exist only as an opt-in, defaultHidden extra (additive-only law) -- never a default column.
  const marginMatch = board.match(/\{\s*key:\s*"margin"[^}]*\}/);
  if (marginMatch && !marginMatch[0].includes("defaultHidden: true")) {
    errors.push("margin column exists but is not defaultHidden -- it must never be a default-visible column");
  }
  return errors;
}

function check(board) {
  const errors = violations(board);
  if (errors.length) throw new Error(errors.join("; "));
}

const board = fs.readFileSync(BOARD, "utf8");

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const swapped = board
    .replace('testId: "col-status"', 'testId: "col-__swap__"')
    .replace('testId: "col-revenue"', 'testId: "col-status"')
    .replace('testId: "col-__swap__"', 'testId: "col-revenue"');
  const mutations = [
    board.replace('testId: "col-unit"', 'testId: "col-removed-unit"'),
    board.replace('testId: "col-gross"', 'testId: "col-removed-gross"'),
    swapped,
    `${board}\n{ key: "category", testId: "col-category", label: "Category" }`,
    board.replace('{ key: "margin", label: "Margin", testId: "col-margin", sortable: true, className: "text-center [font-variant-numeric:tabular-nums]", defaultHidden: true,', '{ key: "margin", label: "Margin", testId: "col-margin", sortable: true, className: "text-center [font-variant-numeric:tabular-nums]",'),
  ];
  for (const mutated of mutations) {
    try { check(mutated); }
    catch { caught += 1; continue; }
    throw new Error("a column-contract mutation escaped detection");
  }
  check(board);
  console.log(`PASS verify-load-costs-board-column-contract --selftest (${caught}/${mutations.length})`);
} else {
  check(board);
  console.log(`PASS verify-load-costs-board-column-contract (19/19 columns, in order, route_crew/costs/category absent)`);
}
