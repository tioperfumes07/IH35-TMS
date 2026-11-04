#!/usr/bin/env node
/**
 * ACCT-F11062 — live check 11-03 (5:00–5:15 PM CT, Owner, USMCA, 1440×900): rows 203 / 167 + live defects.
 * One guard per root cause, each with a --selftest plant that must be caught:
 *
 *  R1 load-costs-board set-based: the legacy bill->settlement link is a MATERIALIZED CTE (no LATERAL inside
 *     settlement_info), and the board filters to its loads (board_loads) before the per-load laterals.
 *     Live: 41,812 ms; EXPLAIN on prod 35,979 ms -> 302 ms, all 13 rows identical except the R2 revenue fix.
 *  R2 revenue join: the charge-line inner alias is never `cl` (the rollup passes load alias "cl").
 *  R3 no String(<row value>).slice(0, 10) in apps/backend/src (node-pg DATE -> "Wed Oct 21" -> year 2001); use pgDateOnly.
 *  R4 calendar dates (expiry / birth / hire / termination / issue / effective) format date-only in apps/frontend/src.
 *  R5 Diesel by truck pages at FUEL_TRANSACTIONS_MAX_PAGE (API cap 200), never a literal page size above it.
 *  R6 Custom report builder single-line inputs use FORM_INPUT_CLASS (40px), no hand-typed py-1 field.
 *  R7 no-settlement cells say why in words: board + registers use NoSettlementCell; Fuel questions read the
 *     settlement live (PROPOSED_SETTLEMENT_LIVE_SQL) and label with fuelQuestionSettlementLabel.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-live-fails-2";
const BE = "apps/backend/src";
const FE = "apps/frontend/src";
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

function walk(rel, exts, out = []) {
  for (const name of readdirSync(path.join(ROOT, rel))) {
    if (name === "node_modules" || name === "generated") continue;
    const r = `${rel}/${name}`;
    const st = statSync(path.join(ROOT, r));
    if (st.isDirectory()) walk(r, exts, out);
    else if (exts.some((e) => name.endsWith(e)) && !/\.test\.|__tests__/.test(r)) out.push(r);
  }
  return out;
}

const FILES = {
  board: `${BE}/accounting/load-costs-board.routes.ts`,
  revenue: `${BE}/accounting/load-costs-live-documents.sql.ts`,
  diesel: `${FE}/pages/fuel/fuelDieselByTruck.ts`,
  custom: `${FE}/pages/reports/CustomReportBuilder.tsx`,
  boardPage: `${FE}/pages/accounting/LoadCostsBoardPage.tsx`,
  fuelQSvc: `${BE}/fuel/fuel-assignment-question.service.ts`,
  fuelQPanel: `${FE}/pages/fuel/components/FuelQuestionsPanel.tsx`,
};

export function boardDefects(board) {
  const out = [];
  if (!board.includes("settlement_bill_link AS MATERIALIZED")) out.push("R1: settlement_bill_link is not a MATERIALIZED set-based CTE");
  const a = board.indexOf("settlement_info AS (");
  const b = board.indexOf("driver_pay_amounts AS (");
  if (a < 0 || b < 0) out.push("R1: settlement_info / driver_pay_amounts markers missing");
  else if (/LEFT JOIN LATERAL/.test(board.slice(a, b))) out.push("R1: settlement_info runs a per-load LATERAL again (18,216 re-runs live)");
  if (!board.includes("board_loads AS MATERIALIZED")) out.push("R1: board_loads prefilter missing");
  if (!/FROM board_loads l\b/.test(board)) out.push("R1: main query does not read board_loads");
  return out;
}

export function revenueDefects(src) {
  return /load_charge_lines\s+cl\b/.test(src) ? ["R2: revenue join aliases load_charge_lines as cl (shadows the rollup's cl)"] : [];
}

const SLICE = /String\(\s*[A-Za-z_$][\w$]*\.[\w$]+\s*\)\.slice\(0,\s*10\)/;
export function backendSliceDefects(files) {
  return files.filter(([f, src]) => !f.endsWith("lib/pg-date-only.ts") && SLICE.test(src)).map(([f]) => `R3: ${f}: String(<row value>).slice(0, 10) — use pgDateOnly`);
}

const CAL_FIELD = /(expir|expires|expiry|\bdob\b|date_of_birth|birth_?date|hire_date|termination_date|issue_date|issued_date|issued_on|effective_date|valid_until|valid_from)/i;
export function calendarDateDefects(files) {
  const out = [];
  const call = /\b(formatDateUS|formatDateQboList)\(/g;
  for (const [f, src] of files) {
    if (f.endsWith("lib/formatDate.ts")) continue;
    let m;
    while ((m = call.exec(src))) {
      let i = m.index + m[0].length;
      let depth = 1;
      const start = i;
      for (; i < src.length && depth > 0; i++) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")") depth--;
      }
      const arg = src.slice(start, i - 1);
      if (CAL_FIELD.test(arg) && !/due_at|dateOnly/.test(arg)) out.push(`R4: ${f}: ${m[1]}(${arg.slice(0, 60)}) — a calendar date must use formatCalendarDateUS`);
    }
  }
  return out;
}

export function dieselDefects(src) {
  const out = [];
  if (!/pageSize = FUEL_TRANSACTIONS_MAX_PAGE/.test(src)) out.push("R5: Diesel by truck does not page at FUEL_TRANSACTIONS_MAX_PAGE");
  const lit = /pageSize = (\d+)/.exec(src);
  if (lit && Number(lit[1]) > 200) out.push(`R5: Diesel by truck page size ${lit[1]} > API cap 200`);
  return out;
}

export function customReportDefects(src) {
  const out = [];
  const m = /<input[\s\S]*?placeholder="Filter: report_id \(optional\)"[\s\S]*?\/>/.exec(src);
  const tag = m ? m[0].slice(m[0].lastIndexOf("<input")) : null;
  if (!tag) out.push("R6: report_id filter input not found");
  else {
    if (!/FORM_INPUT_CLASS/.test(tag)) out.push("R6: report_id filter input is not FORM_INPUT_CLASS (measured 26px live)");
    if (/className="[^"]*\bpy-1\b/.test(tag)) out.push("R6: report_id filter hand-types py-1");
  }
  return out;
}

export function settlementWordsDefects({ boardPage, fuelQSvc, fuelQPanel }) {
  const out = [];
  if ((boardPage.match(/<NoSettlementCell row=/g) ?? []).length < 2) out.push("R7: board column and register must both render NoSettlementCell");
  if (/: \(r\.settlement_display_id \? lbl : "—"\)/.test(boardPage)) out.push("R7: board Settlement/Tour falls back to a bare dash");
  if ((fuelQSvc.match(/\$\{PROPOSED_SETTLEMENT_LIVE_SQL\}/g) ?? []).length < 2) out.push("R7: fuel questions list/get do not read the settlement live");
  if (/render: \(r\) => r\.proposed_settlement_ref \?\? "—"/.test(fuelQPanel)) out.push("R7: Fuel questions Settlement cell is a bare dash again");
  if (!fuelQPanel.includes("fuelQuestionSettlementLabel")) out.push("R7: Fuel questions do not use fuelQuestionSettlementLabel");
  return out;
}

function collect(src) {
  return [
    ...boardDefects(src.board),
    ...revenueDefects(src.revenue),
    ...backendSliceDefects(src.backendFiles),
    ...calendarDateDefects(src.frontendFiles),
    ...dieselDefects(src.diesel),
    ...customReportDefects(src.custom),
    ...settlementWordsDefects(src),
  ];
}

function load() {
  const s = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, read(f)]));
  s.backendFiles = walk(BE, [".ts"]).map((f) => [f, read(f)]);
  s.frontendFiles = walk(FE, [".ts", ".tsx"]).map((f) => [f, read(f)]);
  return s;
}

const sources = load();

if (process.argv.includes("--selftest")) {
  const base = collect(sources);
  if (base.length) {
    console.error(`${LABEL} --selftest: baseline not clean:\n  ${base.join("\n  ")}`);
    process.exit(1);
  }
  const plants = [
    ["R1 lateral back in settlement_info", { board: sources.board.replace("LEFT JOIN settlement_bill_link bill_link", "LEFT JOIN LATERAL (SELECT 1) bill_link ON true LEFT JOIN settlement_bill_link bl2") }],
    ["R1 board_loads removed", { board: sources.board.replace("FROM board_loads l", "FROM mdata.loads l") }],
    ["R2 alias cl", { revenue: sources.revenue.replace("load_charge_lines rcl", "load_charge_lines cl") }],
    ["R3 String(row.x).slice", { backendFiles: [...sources.backendFiles, ["planted.ts", "const d = String(row.period_start).slice(0, 10);"]] }],
    ["R4 expiry via formatDateUS", { frontendFiles: [...sources.frontendFiles, ["planted.tsx", "render: (r) => formatDateUS(r.cdl_expires_at)"]] }],
    ["R5 pageSize 500", { diesel: sources.diesel.replace("pageSize = FUEL_TRANSACTIONS_MAX_PAGE", "pageSize = 500") }],
    ["R6 py-1 filter", { custom: sources.custom.replace("className={`mt-2 ${FORM_INPUT_CLASS}`}", 'className="mt-2 w-full rounded-sm border px-2 py-1 text-xs"') }],
    ["R7 bare dash board", { boardPage: sources.boardPage.replace("(r.settlement_display_id ? lbl : <NoSettlementCell row={r} />)", '(r.settlement_display_id ? lbl : "—")') }],
    ["R7 fuel snapshot", { fuelQSvc: sources.fuelQSvc.replaceAll("${PROPOSED_SETTLEMENT_LIVE_SQL}", "q.proposed_settlement_ref") }],
    ["R7 fuel dash", { fuelQPanel: sources.fuelQPanel.replace("render: (r) => fuelQuestionSettlementCell(r),", 'render: (r) => r.proposed_settlement_ref ?? "—",').replaceAll("fuelQuestionSettlementLabel", "x") }],
  ];
  let caught = 0;
  for (const [name, patch] of plants) {
    const mutated = { ...sources, ...patch };
    if (collect(mutated).length > 0) caught++;
    else console.error(`${LABEL} --selftest: plant NOT caught: ${name}`);
  }
  if (caught !== plants.length) process.exit(1);
  console.log(`${LABEL} --selftest PASS (${caught}/${plants.length} plants caught, baseline clean)`);
  process.exit(0);
}

const defects = collect(sources);
if (defects.length) {
  console.error(`${LABEL}: FAIL (${defects.length})\n  ${defects.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — board set-based, revenue alias safe, no DATE slice, calendar dates date-only, diesel pages ≤200, 40px filter, no-settlement words`);
