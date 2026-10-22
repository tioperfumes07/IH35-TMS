#!/usr/bin/env node
/**
 * verify-fe-load-labels-and-status-sets — LEAD 443.206R (owner law 2026-09-28 "ALL LOAD BOARD VIEWS ARE ONE SERVICE"), register
 * B9 / B11 / B12 / B13 / C5 + 443.206 D1 / D4 / wrong-key bugs. STATIC (frontend source only):
 *   RULE 1 (C5)  — ONE load status label: lib/load-status.ts loadStatusLabel() covers every mdata.load_status_enum value incl.
 *                  'voided'; no other frontend file defines a load-status label map or prints a load status with replace(/_/g).
 *   RULE 2 (B11) — shared status sets: the listed files import their sets from lib/load-status.ts — no copied literal.
 *   RULE 3 (B9)  — ONE draft definition (isDraftLoad) where the List / Board decide "draft".
 *   RULE 4 (D1)  — the two planner reads have distinct cache keys.
 *   RULE 5       — no ["loads","detail",X] whose second element is not the company (the real key is ["loads","detail",co,id]).
 *   RULE 6 (B13) — Dispatch.tsx parseFilters reads unit_id (the TruckPlanner Book link).
 *   RULE 7 (D4)  — both planners render the backend's unassigned_loads.
 *   RULE 8 (B12) — the Kanban reads the whole board, never the List's page.
 * --selftest plants each regression.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOW_OFFLINE_SKIP = "static frontend source check — no database";
const LABEL = "verify-fe-load-labels-and-status-sets";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FE = "apps/frontend/src/";
const FILES = {
  lib: "lib/load-status.ts",
  constants: "components/dispatch/constants.ts",
  apiError: "lib/api-error-message.ts",
  toast: "pages/dispatch/components/book-load-toast.ts",
  roundTrips: "pages/dispatch/roundTripsLegs.ts",
  kanban: "components/dispatch/DispatchKanban.tsx",
  overview: "pages/dispatch/DispatchOverview.tsx",
  drivers: "pages/Drivers.tsx",
  dispatch: "pages/Dispatch.tsx",
  board: "pages/dispatch/DispatchBoard.tsx",
  loadsPlanner: "pages/dispatch/planners/LoadsPlanner.tsx",
  plannerBars: "pages/dispatch/planners/planner-bars.ts",
  timeline: "pages/dispatch/planners/UnifiedTimelinePlanner.tsx",
  reassign: "pages/dispatch/LoadReassignModal.tsx",
  multiStop: "pages/dispatch/MultiStopEditor.tsx",
};
const ENUM = ["draft", "booked", "planned", "unassigned", "assigned", "assigned_not_dispatched", "dispatched", "at_pickup", "in_transit",
  "at_delivery", "delivered", "delivered_pending_docs", "completed_docs_received", "invoiced", "paid", "closed", "cancelled", "abandoned",
  "driver_walkoff", "driver_no_show", "voided"];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== "__tests__" && e.name !== "generated") walk(p, out); }
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
export function readTree() {
  const read = (rel) => { try { return fs.readFileSync(path.join(ROOT, FE, rel), "utf8"); } catch { return ""; } };
  const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
  const all = walk(path.join(ROOT, FE)).map((p) => [path.relative(path.join(ROOT, FE), p), fs.readFileSync(p, "utf8")]);
  return { src, all };
}

export function check({ src, all }) {
  const f = [];
  for (const [k, rel] of Object.entries(FILES)) if (!src[k]) f.push(`MISSING ${FE}${rel}`);
  // RULE 1
  for (const s of ENUM) {
    if (!new RegExp(`\\n  "?${s}"?,\\n`).test(src.lib.slice(src.lib.indexOf("LOAD_STATUS_VALUES"), src.lib.indexOf("] as const;", src.lib.indexOf("LOAD_STATUS_VALUES")) + 12)))
      f.push(`RULE 1 ${FILES.lib}: LOAD_STATUS_VALUES is missing "${s}"`);
    if (!new RegExp(`\\n  ${s}: "`).test(src.lib)) f.push(`RULE 1 ${FILES.lib}: loadStatusLabel has no label for "${s}"`);
  }
  for (const [rel, s] of all) {
    if (rel === FILES.lib) continue;
    if (/^\s*delivered_pending_docs\s*:\s*["'`]/m.test(s) && /^\s*in_transit\s*:\s*["'`]/m.test(s)) f.push(`RULE 1 ${rel}: a private load-status label map (use loadStatusLabel)`);
    if (/\b(?:load|leg|clicked)\.status\.replace\(\/_\/g/.test(s)) f.push(`RULE 1 ${rel}: prints a load status with replace(/_/g) (use loadStatusLabel)`);
  }
  if (/export const STATUS_LABEL\b/.test(src.constants)) f.push(`RULE 1 ${FILES.constants}: STATUS_LABEL is a second label map`);
  // RULE 2
  if (!/export const RT_PAIRING_ACTIVE_STATUSES = \[\.\.\.DISPATCH_WORK_STATUSES\] as const;/.test(src.roundTrips)) f.push(`RULE 2 ${FILES.roundTrips}: RT_PAIRING_ACTIVE_STATUSES must be the shared DISPATCH_WORK_STATUSES`);
  if (!/new Set<string>\(TERMINAL_EXIT_STATUSES\)/.test(src.kanban) || !/new Set<string>\(BACKLOG_STATUSES\)/.test(src.kanban)) f.push(`RULE 2 ${FILES.kanban}: Kanban status sets must come from lib/load-status.ts`);
  if (/new Set\(\["cancelled"/.test(src.kanban)) f.push(`RULE 2 ${FILES.kanban}: copied terminal-status literal`);
  if (!/const ACTIVE_LOAD_DRILL_STATUSES = DISPATCH_WORK_STATUSES;/.test(src.overview)) f.push(`RULE 2 ${FILES.overview}: the Active-loads drill set must be DISPATCH_WORK_STATUSES`);
  if (/status: \["dispatched", "in_transit"\]|status: \["assigned_not_dispatched"/.test(src.overview)) f.push(`RULE 2 ${FILES.overview}: copied status-list literal`);
  if (/status: \["assigned_not_dispatched"/.test(src.drivers)) f.push(`RULE 2 ${FILES.drivers}: copied status-list literal (the board set is the default scope)`);
  if (/DISPATCH_STATUS_GROUPS\s*:\s*Array|statuses: \["draft", "booked", "planned"\]/.test(src.constants)) f.push(`RULE 2 ${FILES.constants}: a second status-group literal (LOAD_STATUS_GROUPS lives in lib/load-status.ts)`);
  // RULE 3
  if (!/isDraftLoad\(clicked\)/.test(src.dispatch) || !/isDraftLoad\(load\)/.test(src.board)) f.push(`RULE 3: List / Board must use isDraftLoad (one draft definition)`);
  if (!/export function isDraftLoad[\s\S]*?load\.status === "draft" \|\| load\.is_quicksave_draft === true/.test(src.lib)) f.push(`RULE 3 ${FILES.lib}: isDraftLoad = status 'draft' OR quick-save draft`);
  // RULE 4
  const k1 = src.loadsPlanner.match(/queryKey: (\[[^\]]+\])/)?.[1] ?? "";
  const k2 = src.plannerBars.match(/queryKey: (\[[^\]]+\])/)?.[1] ?? "";
  if (!k1 || !k2 || k1 === k2 || !/"week-events"/.test(k1) || !/"rows"/.test(k2)) f.push(`RULE 4: the planner week-events read and the list read share a cache key (${k1} / ${k2})`);
  // RULE 5
  for (const [rel, s] of all) {
    for (const m of s.matchAll(/\["loads",\s*"detail",\s*([^\],]+)\]/g)) f.push(`RULE 5 ${rel}: ["loads","detail",${m[1].trim()}] — the key is ["loads","detail",company,id]`);
  }
  // RULE 6
  const pf = src.dispatch.slice(src.dispatch.indexOf("function parseFilters("), src.dispatch.indexOf("function serializeFilters("));
  if (!/params\.get\("unit_id"\)/.test(pf)) f.push(`RULE 6 ${FILES.dispatch}: parseFilters ignores unit_id (TruckPlanner Book link does nothing)`);
  // RULE 7
  if (!/unassigned_loads/.test(src.loadsPlanner) || !/unassigned_loads/.test(src.timeline) || !/timeline-unassigned-row/.test(src.timeline)) f.push(`RULE 7: the planners must render unassigned_loads (Unassigned row)`);
  // RULE 8
  if (!/const wholeBoardFetch = roundTripsFullFetch \|\| \(subTab === "load_board" && view === "kanban"\);/.test(src.dispatch)) f.push(`RULE 8 ${FILES.dispatch}: the Kanban must read the whole board (no 50-row page)`);
  return f;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const tree = readTree();
  if (process.argv.includes("--selftest")) {
    const base = check(tree);
    if (base.length) { console.error(`${LABEL} --selftest FAIL: baseline not clean\n  ${base.join("\n  ")}`); process.exit(1); }
    const plant = (k, fn) => ({ ...tree, src: { ...tree.src, [k]: fn(tree.src[k]) } });
    const plantAll = (rel, extra) => ({ ...tree, all: [...tree.all, [rel, extra]] });
    const plants = [
      ["voided label dropped", plant("lib", (s) => s.replace('  voided: "Voided",\n', ""))],
      ["private label map", plantAll("pages/x.tsx", 'const M = {\n  delivered_pending_docs: "x",\n  in_transit: "y",\n};')],
      ["raw underscore renderer", plantAll("pages/y.tsx", "const t = load.status.replace(/_/g, \" \");")],
      ["round-trips literal copy", plant("roundTrips", (s) => s.replace("export const RT_PAIRING_ACTIVE_STATUSES = [...DISPATCH_WORK_STATUSES] as const;", 'export const RT_PAIRING_ACTIVE_STATUSES = ["dispatched"] as const;'))],
      ["kanban literal copy", plant("kanban", (s) => s.replace("new Set<string>(TERMINAL_EXIT_STATUSES)", 'new Set(["cancelled"])'))],
      ["overview drill literal", plant("overview", (s) => s.replace("const ACTIVE_LOAD_DRILL_STATUSES = DISPATCH_WORK_STATUSES;", 'const ACTIVE_LOAD_DRILL_STATUSES = ["dispatched"] as const;'))],
      ["drivers literal", plant("drivers", (s) => s.replace("status: [],", 'status: ["assigned_not_dispatched", "dispatched"],'))],
      ["second draft definition", plant("board", (s) => s.replace("isDraftLoad(load)", 'load.status === "draft"'))],
      ["planner key collision", plant("plannerBars", (s) => s.replace('"loads", "rows",', '"loads", "week-events",'))],
      ["wrong detail key", plantAll("pages/z.tsx", 'qc.invalidateQueries({ queryKey: ["loads", "detail", loadId] });')],
      ["unit_id ignored", plant("dispatch", (s) => s.replace('unitId: params.get("unit_id"),', "unitId: null,"))],
      ["unassigned row dropped", plant("timeline", (s) => s.replaceAll("timeline-unassigned-row", "x"))],
      ["kanban back on the page", plant("dispatch", (s) => s.replace('const wholeBoardFetch = roundTripsFullFetch || (subTab === "load_board" && view === "kanban");', "const wholeBoardFetch = roundTripsFullFetch;"))],
    ];
    let bad = 0;
    for (const [n, t] of plants) {
      const same = JSON.stringify(t.src) === JSON.stringify(tree.src) && t.all.length === tree.all.length;
      if (same || !check(t).length) { bad++; console.error(`  ✗ plant "${n}" ${same ? "did not apply" : "not caught"}`); }
    }
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${plants.length}/${plants.length})`);
    process.exit(bad ? 1 : 0);
  }
  const f = check(tree);
  if (f.length) { console.error(`${LABEL}: FAIL (${f.length})\n  ${f.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: PASS — one load-status label + shared status sets, one draft definition, distinct planner keys, company-scoped detail keys, unit_id honoured, planner Unassigned row, Kanban whole board`);
}
