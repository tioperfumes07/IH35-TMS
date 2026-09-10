#!/usr/bin/env node
/** @matrix-built modules=settlements,accounting cols=connectivity task=REG-010-011 */
/**
 * verify-load-costs-settlement-legs-columns — ROUND 16.1 (owner 2026-09-06 20:2xZ verbatim:
 * "I AM IN LOAD COSTS, SETTLEMENT. THE LEGS, WHAT IS THAT, THE COLUMNS NEED TO AUTO ADJUST, AND 8
 *  LEGS, WELL ORGANIZE THEM CORRECTLY, WE CANNOT HAVE A COLUMN OCCUPY ALL SCREEN, BE LOGICAL.")
 *
 * MEASURED live FE 4500a712 on /accounting/load-costs → Settlement tab: the Legs column was 68px with
 * white-space:normal so "7 · NB 13519 → NB 13550 → …" wrapped a row to 265px tall; money cells
 * ("$12,595.90") wrapped for lack of nowrap; dates were 218/197px for a 10-char date.
 *
 * END STATE this STATIC, fail-closed guard pins (against the source on tip):
 *   1. The shared leg-pill renderer (components/dispatch/TourLegsCell.tsx): a count pill ("N legs"),
 *      each leg an EntityLink kind="load" pill, type-colored (nb/tr/sb/local), overflow → "+N more".
 *   2. The Legs header explains itself (LEGS_HEADER_TITLE "Legs = the loads in this tour, in order…").
 *   3. ParityTable supports a per-column maxWidth (auto-fit ceiling) and a headerTitle tooltip — the
 *      mechanism that stops a column occupying the whole screen and lets the header explain itself.
 *   4. REG-010/011 owner correction (2026-09-10): both registers use shared tourLoadColumns;
 *      the first load number, first trip type and load count each have a separate column. A
 *      summary never concatenates several loads; full leg rows remain in the expanded detail.
 *      Existing money nowrap, compact date caps and honest company empty states remain required.
 *   5. The backend tour list (tour-readout.routes.ts listTours) projects a compact legs[] (load_id +
 *      load_number + trip_type) so each pill can be an EntityLink to the load.
 *
 * --selftest mutates each load-bearing fact and requires each mutation to FAIL; clean sources pass.
 */
import fs from "node:fs";

const CELL = "apps/frontend/src/components/dispatch/TourLegsCell.tsx";
const BOARD = "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx";
const SETL = "apps/frontend/src/pages/driver-finance/SettlementsToursRegister.tsx";
const PARITY = "apps/frontend/src/components/parity/ParityTable.tsx";
const BACKEND = "apps/backend/src/driver-finance/tour-readout.routes.ts";

function analyze(src) {
  const { cell, board, setl, parity, backend } = src;
  const errors = [];

  // 1. shared leg-pill renderer
  if (!/export function TourLegsCell\b/.test(cell)) errors.push("TourLegsCell is not exported from TourLegsCell.tsx");
  if (!/ldt-legcount/.test(cell) || !/\}\s*legs\b/.test(cell)) errors.push("TourLegsCell must render a count pill ('N legs')");
  if (!/kind="load"/.test(cell) || !/EntityLink/.test(cell)) errors.push("TourLegsCell must render each leg as an EntityLink kind=load pill");
  if (!/ldt-legmore/.test(cell) || !/\+\{hidden\} more/.test(cell)) errors.push("TourLegsCell must collapse overflow to a '+N more' pill");
  for (const cls of ["ldt-legpill nb", "ldt-legpill tr", "ldt-legpill sb", "ldt-legpill local"]) {
    if (!cell.includes(cls)) errors.push(`TourLegsCell legPillClass is missing the type color '${cls}'`);
  }

  // 2. self-explaining header
  if (!/export const LEGS_HEADER_TITLE\b/.test(cell) || !/Legs = the loads in this tour, in order/.test(cell)) {
    errors.push("LEGS_HEADER_TITLE must be exported and explain what a leg is (owner: 'WHAT IS THAT')");
  }

  // Owner REG-010/011: retain links without mixing number, trip type and count in a cell.
  const summary = cell.slice(cell.indexOf("export function tourLoadColumns"));
  if (!/export function tourLoadColumns/.test(cell)) errors.push("shared tourLoadColumns is missing");
  for (const label of ["Load Number", "Trip type", "Load count"]) {
    if (!summary.includes(`label: "${label}"`)) errors.push(`summary missing separate ${label} column`);
  }
  if (!/headerTitle: "First load in this tour; expand the settlement to see every load"/.test(summary)) errors.push("summary must explain the first load and full detail");
  if (!/render: r => r\.legs\?\.\[0\] \? <EntityLink kind="load" id=\{r\.legs\[0\]\.load_id\} label=\{r\.legs\[0\]\.load_number\}/.test(summary)) errors.push("summary must link exactly the first load using its canonical label");
  if (/\.map\(|\.join\(/.test(summary)) errors.push("summary must not concatenate multiple load numbers/types in one cell");
  if (!/render: r => r\.legs\?\.\[0\]\?\.trip_type \?\? DASH/.test(summary)) errors.push("trip type column must show the first load's type");
  if (!/sortValue: r => r\.leg_count, render: r => r\.leg_count/.test(summary)) errors.push("load count must sort and render its own value");

  // 3. ParityTable maxWidth ceiling + headerTitle tooltip
  if (!/maxWidth\?\:\s*number/.test(parity)) errors.push("ParityColumn must declare an optional maxWidth (auto-fit ceiling)");
  if (!/column\.maxWidth/.test(parity)) errors.push("ParityTable auto-fit must honor column.maxWidth as the ceiling");
  if (!/headerTitle\?\:\s*string/.test(parity)) errors.push("ParityColumn must declare an optional headerTitle");
  if (!/title=\{column\.headerTitle\}/.test(parity)) errors.push("ParityTable header must render title={column.headerTitle}");

  // 4. both registers wire it correctly
  for (const [label, s] of [["LoadCostsBoardPage", board], ["SettlementsToursRegister", setl]]) {
    if (!/\.\.\.tourLoadColumns\(/.test(s)) errors.push(`${label} must use the shared separate load/type/count columns`);
    if (/<TourLegsCell\b/.test(s)) errors.push(`${label} must not restore the compound Legs summary cell`);
    // money cells never wrap.
    if (!/key:\s*"revenue"[\s\S]{0,160}?whitespace-nowrap text-right tabular-nums/.test(s)) {
      errors.push(`${label} money cells must be whitespace-nowrap (Revenue) so "$12,595.90" never wraps`);
    }
    if (!/mmmDd\(/.test(s)) errors.push(`${label} Started/Closed dates must use the compact mmmDd formatter`);
    if (!/maxWidth:\s*112/.test(s)) errors.push(`${label} date columns must be capped (maxWidth 112) so a 10-char date can't be 218px`);
    if (!/not opened/.test(s)) errors.push(`${label} company-settlement empty state must be a "not opened" pill`);
  }

  // 5. backend legs[] projection
  if (!/legs:\s*live\.map\(\(l\)\s*=>\s*\(\{\s*load_id:\s*l\.load_id/.test(backend)) {
    errors.push("listTours must project a compact legs[] (load_id/load_number/trip_type) so each pill is an EntityLink");
  }
  if (!/legs:\s*\{\s*load_id:\s*string;\s*load_number:\s*string;\s*trip_type:\s*string\s*\|\s*null\s*\}\[\]/.test(backend)) {
    errors.push("TourListRow (backend) must declare the compact legs[] field");
  }

  return errors;
}

const base = {
  cell: fs.readFileSync(CELL, "utf8"),
  board: fs.readFileSync(BOARD, "utf8"),
  setl: fs.readFileSync(SETL, "utf8"),
  parity: fs.readFileSync(PARITY, "utf8"),
  backend: fs.readFileSync(BACKEND, "utf8"),
};

function withField(field, transform) {
  return { ...base, [field]: transform(base[field]) };
}

if (process.argv.includes("--selftest")) {
  const clean = analyze(base);
  if (clean.length) {
    console.error(`SELFTEST FAIL — clean source rejected:\n- ${clean.join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["cell drops count pill", withField("cell", (s) => s.replace(/ldt-legcount/g, "gone"))],
    ["cell drops EntityLink leg", withField("cell", (s) => s.replace(/kind="load"/g, 'kind="none"'))],
    ["cell drops +N more overflow", withField("cell", (s) => s.replace(/ldt-legmore/g, "gone"))],
    ["cell drops NB color", withField("cell", (s) => s.replace(/ldt-legpill nb/g, "ldt-legpill gone"))],
    ["cell drops header title text", withField("cell", (s) => s.replace(/Legs = the loads in this tour, in order/g, "x"))],
    ["parity drops maxWidth type", withField("parity", (s) => s.replace(/maxWidth\?: number/g, "goneWidth?: number"))],
    ["parity drops maxWidth honor", withField("parity", (s) => s.replace(/column\.maxWidth/g, "column.gone"))],
    ["parity drops headerTitle render", withField("parity", (s) => s.replace(/title=\{column\.headerTitle\}/g, "data-x={column.headerTitle}"))],
    ["board drops separate columns", withField("board", (s) => s.replace(/\.\.\.tourLoadColumns\(/g, "...goneColumns("))],
    ["summary restores multiple numbers", withField("cell", (s) => s + "\n// .map( multiple loads )")],
    ["summary loses first-load link", withField("cell", (s) => s.replace(/id=\{r\.legs\[0\]\.load_id\}/g, "id={r.settlement_id}"))],
    ["summary loses load count column", withField("cell", (s) => s.replace(/label: "Load count"/g, 'label: "Combined"'))],
    ["board money wraps", withField("board", (s) => s.replace(/key: "revenue", label: "Revenue", testId: "tour-col-revenue", sortable: true, cellClass: "whitespace-nowrap text-right tabular-nums"/g, 'key: "revenue", label: "Revenue", testId: "tour-col-revenue", sortable: true, cellClass: "text-right tabular-nums"'))],
    ["board dates uncapped", withField("board", (s) => s.replace(/maxWidth: 112/g, "maxWidth: 999"))],
    ["board company not-opened dropped", withField("board", (s) => s.replace(/not opened/g, "none"))],
    ["setl drops separate columns", withField("setl", (s) => s.replace(/\.\.\.tourLoadColumns\(/g, "...goneColumns("))],
    ["setl money wraps", withField("setl", (s) => s.replace(/key: "revenue", label: "Revenue", testId: "setl-tour-col-revenue", sortable: true, cellClass: "whitespace-nowrap text-right tabular-nums"/g, 'key: "revenue", label: "Revenue", testId: "setl-tour-col-revenue", sortable: true, cellClass: "text-right tabular-nums"'))],
    ["backend drops legs projection", withField("backend", (s) => s.replace(/legs: live\.map\(\(l\) => \(\{ load_id: l\.load_id, load_number: l\.load_number, trip_type: l\.trip_type \}\)\),/g, ""))],
    ["backend drops legs type", withField("backend", (s) => s.replace(/legs: \{ load_id: string; load_number: string; trip_type: string \| null \}\[\];/g, ""))],
  ];
  let caught = 0;
  for (const [label, mutated] of mutations) {
    if (analyze(mutated).length > 0) { caught += 1; continue; }
    console.error(`SELFTEST FAIL — mutation escaped: ${label}`);
    process.exit(1);
  }
  console.log(`PASS verify-load-costs-settlement-legs-columns --selftest ${caught}/${mutations.length}`);
  process.exit(0);
}

const failures = analyze(base);
if (failures.length) {
  console.error("FAIL verify-load-costs-settlement-legs-columns");
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}
console.log("PASS verify-load-costs-settlement-legs-columns");
