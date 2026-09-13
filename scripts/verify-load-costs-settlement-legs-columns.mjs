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
// DISPATCH-ONE-ROW-PER-LOAD (owner 2026-09-11): LoadCostsBoardPage's own tour columns moved here.
const ROWS = "apps/frontend/src/components/dispatch/TourLoadRows.tsx";

function analyze(src) {
  const { cell, board, setl, parity, backend, rows } = src;
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
  // CORRECTED 2026-09-11 ("SETTLEMENT LOAD LINKAGE: FIX THE RENDER, NOT THE SCHEMA", see
  // TourLegsCell.tsx's own header comment on tourLoadColumns): the Load Number column's original
  // "first load only, expand to see the rest" design was an owner-overturned bug — a settlement/
  // tour can and should cover multiple loads, so the column now renders EVERY leg via the shared
  // TourLegsCell pill strip (count pill + up to LEGS_VISIBLE loads + "+N more"), never a single
  // bookend/first-load stand-in. This guard's checks below were pinned to the retired first-load
  // shape and are updated to match the current, corrected design.
  const summary = cell.slice(cell.indexOf("export function tourLoadColumns"));
  if (!/export function tourLoadColumns/.test(cell)) errors.push("shared tourLoadColumns is missing");
  for (const label of ["Load Number", "Trip type", "Load count"]) {
    if (!summary.includes(`label: "${label}"`)) errors.push(`summary missing separate ${label} column`);
  }
  if (!/headerTitle: "Every load in this tour"/.test(summary)) errors.push("summary must explain that every load in the tour is shown");
  if (!/render: r => <TourLegsCell legs=\{r\.legs\} \/>/.test(summary)) errors.push("summary Load Number column must delegate to the shared TourLegsCell pill strip (every leg, not just the first)");
  // The RENDER must never flatten every load into one string cell (that was the old bug); a
  // machine-readable CSV exportValue joining load numbers with " / " is a different surface (no
  // JSX, never shown as a table cell) and is explicitly allowed.
  const renderOnly = (summary.match(/render:\s*r\s*=>\s*<TourLegsCell[^}]*\}/) || [""])[0];
  if (/\.map\(|\.join\(/.test(renderOnly)) errors.push("summary render must not concatenate multiple load numbers/types in one cell");
  if (!/render: r => r\.legs\?\.\[0\]\?\.trip_type \?\? DASH/.test(summary)) errors.push("trip type column must show the first load's type");
  if (!/sortValue: r => r\.leg_count, render: r => r\.leg_count/.test(summary)) errors.push("load count must sort and render its own value");

  // 3. ParityTable maxWidth ceiling + headerTitle tooltip
  if (!/maxWidth\?\:\s*number/.test(parity)) errors.push("ParityColumn must declare an optional maxWidth (auto-fit ceiling)");
  if (!/column\.maxWidth/.test(parity)) errors.push("ParityTable auto-fit must honor column.maxWidth as the ceiling");
  if (!/headerTitle\?\:\s*string/.test(parity)) errors.push("ParityColumn must declare an optional headerTitle");
  if (!/title=\{column\.headerTitle\}/.test(parity)) errors.push("ParityTable header must render title={column.headerTitle}");

  // 4. both registers wire it correctly.
  // DISPATCH-ONE-ROW-PER-LOAD (owner 2026-09-11): LoadCostsBoardPage.tsx moved its tour register
  // from the shared tourLoadColumns() (one row per TOUR, multi-leg pill cell) to its own
  // TOUR_LOAD_COLUMNS in TourLoadRows.tsx (one row per LOAD — the load sits directly next to the
  // settlement/tour column, per COLUMN-ORDERING LAW). SettlementsToursRegister.tsx (the separate
  // /settlements Tours register) is untouched by that refactor and still uses the original shared
  // factory — so it keeps the original check shape; the board's checks below point at `rows`
  // (TourLoadRows.tsx) instead of `board` (LoadCostsBoardPage.tsx) to follow where the columns
  // actually live now.
  if (!/\.\.\.tourLoadColumns\(/.test(setl)) errors.push("SettlementsToursRegister must use the shared separate load/type/count columns");
  if (/<TourLegsCell\b/.test(setl)) errors.push("SettlementsToursRegister must not restore the compound Legs summary cell");
  if (!/key:\s*"revenue"[\s\S]{0,160}?whitespace-nowrap text-right tabular-nums/.test(setl)) {
    errors.push('SettlementsToursRegister money cells must be whitespace-nowrap (Revenue) so "$12,595.90" never wraps');
  }
  if (!/mmmDd\(/.test(setl)) errors.push("SettlementsToursRegister Started/Closed dates must use the compact mmmDd formatter");
  if (!/maxWidth:\s*112/.test(setl)) errors.push("SettlementsToursRegister date columns must be capped (maxWidth 112) so a 10-char date can't be 218px");
  if (!/not opened/.test(setl)) errors.push('SettlementsToursRegister company-settlement empty state must be a "not opened" pill');

  if (/\.\.\.tourLoadColumns\(/.test(board)) errors.push("LoadCostsBoardPage must import its tour columns from TourLoadRows.tsx (TOUR_LOAD_COLUMNS), not the shared tourLoadColumns() -- see DISPATCH-ONE-ROW-PER-LOAD");
  if (!/TOUR_LOAD_COLUMNS/.test(board)) errors.push("LoadCostsBoardPage must render TOUR_LOAD_COLUMNS (one row per load)");
  if (/<TourLegsCell\b/.test(rows)) errors.push("TourLoadRows must not restore the compound Legs summary cell (one row per load makes it redundant)");
  if (!/const MONEY = "whitespace-nowrap text-right tabular-nums"/.test(rows) || !/key:\s*"revenue"[\s\S]{0,120}?cellClass:\s*MONEY/.test(rows)) {
    errors.push('TourLoadRows money cells must be whitespace-nowrap (Revenue) so "$12,595.90" never wraps');
  }
  if (!/mmmDd\(/.test(rows)) errors.push("TourLoadRows Started/Closed dates must use the compact mmmDd formatter");
  if (!/maxWidth:\s*112/.test(rows)) errors.push("TourLoadRows date columns must be capped (maxWidth 112) so a 10-char date can't be 218px");
  if (!/not opened/.test(rows)) errors.push('TourLoadRows company-settlement empty state must be a "not opened" pill');

  // 5. backend legs[] projection
  if (!/legs:\s*live\.map\(\(l\)\s*=>\s*\(\{\s*load_id:\s*l\.load_id/.test(backend)) {
    errors.push("listTours must project a compact legs[] (load_id/load_number/trip_type) so each pill is an EntityLink");
  }
  // DISPATCH-ONE-ROW-PER-LOAD (owner 2026-09-11): TourListRow.legs grew from the original 3-field
  // pill shape (load_id/load_number/trip_type) to carry each leg's own money/miles too, so the
  // Load-Costs register can flatten one tour row into one row per load. The field's own name and
  // load_id/load_number/trip_type prefix are still the load-bearing fact this check pins — the
  // exact field LIST is allowed to grow (real legs need real per-leg money to render one row per
  // load), so this only requires the object to still START with those three fields.
  if (!/legs:\s*\{\s*load_id:\s*string;\s*load_number:\s*string;\s*trip_type:\s*string\s*\|\s*null;/.test(backend)) {
    errors.push("TourListRow (backend) must declare the legs[] field starting with load_id/load_number/trip_type");
  }

  return errors;
}

const base = {
  cell: fs.readFileSync(CELL, "utf8"),
  board: fs.readFileSync(BOARD, "utf8"),
  setl: fs.readFileSync(SETL, "utf8"),
  parity: fs.readFileSync(PARITY, "utf8"),
  backend: fs.readFileSync(BACKEND, "utf8"),
  rows: fs.readFileSync(ROWS, "utf8"),
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
    ["board drops TOUR_LOAD_COLUMNS", withField("board", (s) => s.replace(/TOUR_LOAD_COLUMNS/g, "GONE_COLUMNS"))],
    ["board restores shared tourLoadColumns", withField("board", (s) => `import { tourLoadColumns } from "../../components/dispatch/TourLegsCell";\n${s}\n...tourLoadColumns("x"),`)],
    ["summary restores multiple numbers", withField("cell", (s) => s.replace("render: r => <TourLegsCell legs={r.legs} />", "render: r => <TourLegsCell legs={r.legs.map(l => l)} />"))],
    ["summary loses TourLegsCell delegation", withField("cell", (s) => s.replace("render: r => <TourLegsCell legs={r.legs} />", "render: r => r.legs?.[0]?.load_number ?? DASH"))],
    ["summary loses load count column", withField("cell", (s) => s.replace(/label: "Load count"/g, 'label: "Combined"'))],
    ["rows money wraps", withField("rows", (s) => s.replace(/const MONEY = "whitespace-nowrap text-right tabular-nums";/g, 'const MONEY = "text-right tabular-nums";'))],
    ["rows dates uncapped", withField("rows", (s) => s.replace(/maxWidth: 112/g, "maxWidth: 999"))],
    ["rows company not-opened dropped", withField("rows", (s) => s.replace(/not opened/g, "none"))],
    ["rows restores compound Legs cell", withField("rows", (s) => `${s}\n// <TourLegsCell legs={r.legs} />`)],
    ["setl drops separate columns", withField("setl", (s) => s.replace(/\.\.\.tourLoadColumns\(/g, "...goneColumns("))],
    ["setl money wraps", withField("setl", (s) => s.replace(/key: "revenue", label: "Revenue", testId: "setl-tour-col-revenue", sortable: true, cellClass: "whitespace-nowrap text-right tabular-nums"/g, 'key: "revenue", label: "Revenue", testId: "setl-tour-col-revenue", sortable: true, cellClass: "text-right tabular-nums"'))],
    ["backend drops legs projection", withField("backend", (s) => s.replace(/legs: live\.map\(\(l\) => \(\{\n\s*load_id: l\.load_id,/, "legs: live.map((l) => ({\n        dropped_load_id: l.load_id,"))],
    ["backend drops legs type", withField("backend", (s) => s.replace(/legs: \{\n\s*load_id: string; load_number: string; trip_type: string \| null;/, "legs: {\n    dropped_id: string; load_number: string; trip_type: string | null;"))],
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
