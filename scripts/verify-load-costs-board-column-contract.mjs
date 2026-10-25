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
  "line-haul", "fuel-surcharge", "accessorials", "detention-charge", "layover",
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
  // D025 (443.257-D row 144) — PU / Del cells MM/DD/YYYY via formatDateQboList (= formatDateUS).
  // Owner 10-24: "09/14/2026 everywhere" (was M/D/YY two-digit year).
  if (!/import\s*\{\s*formatDateQboList\s*\}\s*from\s*["'][^"']*formatDate["']/.test(board)) {
    errors.push("D025: must import formatDateQboList from lib/formatDate");
  }
  if (!/render:\s*r\s*=>\s*r\.pickup_date\s*\?\s*formatDateQboList\(\s*r\.pickup_date\s*\)/.test(board)) {
    errors.push("D025: PU Date column must render formatDateQboList(r.pickup_date)");
  }
  if (!/render:\s*r\s*=>\s*r\.actual_delivery_at\s*\?\s*formatDateQboList\(\s*r\.actual_delivery_at\s*\)/.test(board)) {
    errors.push("D025: Del Date column must render formatDateQboList(r.actual_delivery_at)");
  }
  if (/year:\s*["']2-digit["']|toLocaleDateString\(/.test(board)) {
    errors.push("D025: board must not format dates with two-digit year / toLocaleDateString");
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
    board.replace(
      '{ key: "margin", label: "Margin", testId: "col-margin", sortable: true, className: NUM, defaultHidden: true,',
      '{ key: "margin", label: "Margin", testId: "col-margin", sortable: true, className: NUM,',
    ),
    board.replace('testId: "col-line-haul"', 'testId: "col-line-haul-GONE"'),
    // D025 — PU Date leaves formatDateQboList
    board.replace(/formatDateQboList\(\s*r\.pickup_date\s*\)/g, "r.pickup_date"),
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
  console.log(`PASS verify-load-costs-board-column-contract (${COLUMN_ORDER.length}/${COLUMN_ORDER.length} columns, in order, route_crew/costs/category absent)`);
}
