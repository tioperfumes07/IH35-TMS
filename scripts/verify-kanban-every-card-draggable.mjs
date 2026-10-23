#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["unit","connectivity"],"leaves":["dispatch.modal.kanban_unit_availability"],"task":"LEAD-443.251-KANBAN-UNIT-AVAILABILITY","vertical":"class-sweep"} */
/**
 * LEAD 443.251 P0 (owner, 2026-10-22 6:00 PM CT, verbatim): "in dispatch, in kanban, the units are still not dragable
 * from one box to the next, i have stated this over 30 times."
 *
 * Every Kanban card is a drag source with a real outcome for every target. Static guard over the board source:
 *   R1  the truck card (AwaitingTruckCard) and the out-of-service truck chip are useDraggable, never disabled, and
 *       show a grab cursor (cursor-pointer beside cursor-grab won the cascade — the card never LOOKED draggable);
 *   R2  the truck card is also a drop target (load card → truck card = assign, item 2);
 *   R3  a truck drop is resolved by resolveKanbanUnitDrop — the old catch-all toast with no outcome is gone;
 *   R4  the resolver's outcomes: load card → assign, Assigned/Dispatched → book with the lane status,
 *       Fleet out of service → mark_oos, OOS truck → Awaiting → return_to_service;
 *   R5  the Fleet out-of-service strip is a droppable, and its writes go through markUnitOos / markUnitBackInService;
 *   R6  no load card's drag is hard-disabled (`disabled: true`);
 *   R7  no empty placeholder rows in a lane (the blank gap under T152/13700, item 3);
 *   R8  the lane preset reaches the booking: Dispatch passes prefillLaneStatus, Book sends book_without_dispatch,
 *       the book engine honours it (an Assigned-lane booking never silently dispatches).
 * --selftest plants each regression (an INERT truck card first, as the Lead ordered) and requires a FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  kanban: "apps/frontend/src/components/dispatch/DispatchKanban.tsx",
  dispatch: "apps/frontend/src/pages/Dispatch.tsx",
  book: "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx",
  engine: "apps/backend/src/dispatch/book-load.service.ts",
  route: "apps/backend/src/dispatch/loads.routes.ts",
};

function fnBody(src, name) {
  const start = src.search(new RegExp(`(?:export\\s+)?function ${name}\\s*\\(`));
  if (start < 0) return "";
  const rest = src.slice(start + 1);
  const next = rest.search(/\n(?:export\s+)?function \w+\s*[(<]/);
  return next < 0 ? src.slice(start) : src.slice(start, start + 1 + next);
}

function handleDragEndBody(src) {
  const start = src.indexOf("const handleDragEnd = async");
  if (start < 0) return "";
  const end = src.indexOf("\n  if (listError)", start);
  return src.slice(start, end < 0 ? undefined : end);
}

export function audit(srcs) {
  const failures = [];
  const fail = (rule, msg) => failures.push(`${rule}: ${msg}`);
  const k = srcs.kanban;

  // R1 — truck card + OOS truck chip are live drag sources with a grab cursor.
  for (const name of ["AwaitingTruckCard", "KanbanOosUnitChip"]) {
    const body = fnBody(k, name);
    if (!body) { fail("R1", `${name} is missing`); continue; }
    if (!/useDraggable\(\{/.test(body)) fail("R1", `${name} is not a useDraggable — an inert truck card`);
    if (/disabled:\s*(true|!)/.test(body)) fail("R1", `${name} disables its drag`);
    if (!/type:\s*"unit"/.test(body)) fail("R1", `${name} does not carry drag data type "unit"`);
    if (!/\{\.\.\.listeners\}/.test(body)) fail("R1", `${name} does not spread the drag listeners on the card`);
    if (/cursor-pointer/.test(body)) fail("R1", `${name} uses cursor-pointer — it wins over cursor-grab, so the card never looks draggable`);
    if (!/cursor-grab/.test(body)) fail("R1", `${name} has no grab cursor`);
  }

  // R2 — the truck card is a drop target for load cards.
  const truck = fnBody(k, "AwaitingTruckCard");
  if (!/useDroppable\(\{[\s\S]{0,200}type:\s*"unit-target"/.test(truck)) fail("R2", "AwaitingTruckCard is not a droppable of type unit-target");

  // R3 — truck drops go through the resolver; the outcome-less catch-all is gone.
  const hde = handleDragEndBody(k);
  if (!hde) fail("R3", "handleDragEnd not found");
  if (!/resolveKanbanUnitDrop\(/.test(hde)) fail("R3", "handleDragEnd does not resolve truck drops through resolveKanbanUnitDrop");
  if (/Drop the truck onto a load card to assign it\./.test(k)) fail("R3", "the old catch-all 'Drop the truck onto a load card to assign it.' is back — a drop with no outcome");
  if (!/overData\.type === "unit-target"/.test(hde)) fail("R2", "a load card dropped on a truck card is not handled (item 2)");
  for (const kind of ["assign", "book", "mark_oos", "return_to_service"]) {
    if (!new RegExp(`outcome\\.kind === "${kind}"`).test(hde)) fail("R3", `handleDragEnd never acts on outcome "${kind}"`);
  }

  // R4 — resolver outcomes.
  const res = fnBody(k, "resolveKanbanUnitDrop");
  if (!res) fail("R4", "resolveKanbanUnitDrop is missing");
  if (!/kind:\s*"assign"/.test(res)) fail("R4", "no assign outcome for a load card");
  if (!/laneKey === "assigned"[\s\S]{0,160}laneStatus:\s*"assigned_not_dispatched"/.test(res)) fail("R4", "Assigned lane does not book with assigned_not_dispatched");
  if (!/laneKey === "dispatched"[\s\S]{0,160}laneStatus:\s*"dispatched"/.test(res)) fail("R4", "Dispatched lane does not book with dispatched");
  if (!/overId === KANBAN_OOS_DROP_ID[\s\S]{0,200}kind:\s*"mark_oos"/.test(res)) fail("R4", "Fleet out of service does not mark the truck out of service");
  if (!/laneKey === "awaiting_assignment"[\s\S]{0,200}kind:\s*"return_to_service"/.test(res)) fail("R4", "an OOS truck dropped on Awaiting assignment is not returned to service");

  // R5 — OOS strip droppable + audited writers.
  if (!/useDroppable\(\{\s*id:\s*KANBAN_OOS_DROP_ID\s*\}\)/.test(k)) fail("R5", "the Fleet out-of-service strip is not a droppable");
  if (!/markUnitOos\(/.test(k) || !/markUnitBackInService\(/.test(k)) fail("R5", "OOS drops do not write through markUnitOos / markUnitBackInService");

  // R6 — no hard-disabled load card drag.
  for (const name of ["KanbanCompactCard", "KanbanStandardCard", "KanbanDispatchCard"]) {
    const body = fnBody(k, name);
    if (body && /useDraggable\(\{[\s\S]{0,200}disabled:\s*true/.test(body)) fail("R6", `${name} hard-disables its drag`);
  }

  // R7 — no blank placeholder rows.
  if (/data-kanban-swim-lane-empty/.test(k)) fail("R7", "lanes still draw empty placeholder rows (the blank gap under T152/13700)");

  // R8 — the lane preset reaches the booking and the engine.
  if (!/prefillLaneStatus=\{/.test(srcs.dispatch)) fail("R8", "Dispatch does not pass prefillLaneStatus to Book");
  if (!/book_without_dispatch:\s*saveMode === "book_dispatch" && bookWithoutDispatch/.test(srcs.book)) fail("R8", "Book does not send book_without_dispatch for the Assigned lane");
  if (!/book_without_dispatch:\s*z\.boolean\(\)\.optional\(\)/.test(srcs.route)) fail("R8", "the Book Load route drops book_without_dispatch");
  if (!/hasCrew && !input\.book_without_dispatch/.test(srcs.engine)) fail("R8", "the book engine dispatches an Assigned-lane booking anyway");

  return failures;
}

function load() {
  const out = {};
  for (const [key, rel] of Object.entries(FILES)) out[key] = fs.readFileSync(path.join(ROOT, rel), "utf8");
  return out;
}

if (process.argv.includes("--selftest")) {
  const real = load();
  const base = audit(real);
  const plant = (key, from, to) => {
    const next = { ...real };
    if (!next[key].includes(from)) return null;
    next[key] = next[key].replace(from, to);
    return audit(next).length > base.length;
  };
  const truckBody = fnBody(real.kanban, "AwaitingTruckCard");
  const cases = [
    ["an INERT truck card (no useDraggable) FAILS", (() => {
      const next = { ...real, kanban: real.kanban.replace(truckBody, truckBody.replace("useDraggable({", "useNothing({")) };
      return audit(next).length > base.length;
    })()],
    ["a disabled truck card drag FAILS", plant("kanban", 'origin: "awaiting" satisfies KanbanUnitOrigin,', 'origin: "awaiting" satisfies KanbanUnitOrigin, disabled: true,')],
    ["cursor-pointer back on the truck card FAILS", plant("kanban", '`select-none rounded-sm border bg-white', '`cursor-pointer select-none rounded-sm border bg-white')],
    ["the truck card no longer a drop target FAILS", plant("kanban", 'data: { type: "unit-target", unitId', 'data: { type: "x", unitId')],
    ["the old catch-all toast FAILS", plant("kanban", "pushToast(outcome.message, \"info\");", "pushToast(\"Drop the truck onto a load card to assign it.\", \"info\");")],
    ["a lane drop that no longer books FAILS", plant("kanban", 'laneStatus: "assigned_not_dispatched", unitLabel', 'laneStatus: "dispatched", unitLabel')],
    ["an OOS strip that is not droppable FAILS", plant("kanban", "useDroppable({ id: KANBAN_OOS_DROP_ID })", "useMemo(() => ({ id: KANBAN_OOS_DROP_ID }))")],
    ["placeholder rows back FAIL", plant("kanban", "data-kanban-unit-card=\"draggable\"", "data-kanban-unit-card=\"draggable\" data-kanban-swim-lane-empty")],
    ["the engine ignoring book_without_dispatch FAILS", plant("engine", "hasCrew && !input.book_without_dispatch", "hasCrew")],
    ["Book not sending the lane preset FAILS", plant("book", 'book_without_dispatch: saveMode === "book_dispatch" && bookWithoutDispatch', "book_without_dispatch: undefined && bookWithoutDispatch")],
  ];
  let bad = 0;
  for (const [name, ok] of cases) {
    console.log(`  ${ok ? "✓" : "✗"} ${name}${ok === null ? " (plant anchor missing)" : ""}`);
    if (!ok) bad += 1;
  }
  console.log(bad ? "verify-kanban-every-card-draggable --selftest FAIL" : `verify-kanban-every-card-draggable --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const failures = audit(load());
if (failures.length) {
  console.error(`verify-kanban-every-card-draggable: FAIL — ${failures.length}`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("verify-kanban-every-card-draggable: OK — every truck and load card drags with an outcome for every target (R1–R8)");
