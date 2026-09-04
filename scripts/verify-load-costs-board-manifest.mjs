#!/usr/bin/env node
import fs from "node:fs";

const BOARD = "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx";
const BACKEND = "apps/backend/src/accounting/load-costs-board.routes.ts";

// LOAD-COSTS-COMPLETE item (3) (owner's exact board-column list, 2026-09-04): Load · Unit · Driver ·
// PU Date · Del Date · Status · Revenue · Late Fee · Lumper · Fuel · R&M Exp · Other · Short Miles ·
// Rate Loaded · Loaded Pay · Empty Miles · Rate Empty · Deadhead Pay · Gross. Replaces the prior
// locked 11-column set (Pickup date/Projected delivery/Delivered/Route and crew/Costs/Driver/Margin)
// by owner order -- this guard was rewritten in the SAME commit as the redesign, per standing rule
// "any tab/column redesign updates its own locked-manifest guard in the same PR."
const IDS = [
  "load-costs-shell", "load-costs-back", "load-costs-title", "load-costs-topbar",
  "load-costs-pill-in_motion", "load-costs-pill-delivered_open", "load-costs-pill-all_open", "load-costs-pill-this_week",
  "load-costs-show-voided",
  "kpi-loads-in-motion", "kpi-revenue-booked", "kpi-costs-recorded", "kpi-driver-pay", "kpi-approx-margin", "kpi-bank-unmatched",
  "col-load", "col-unit", "col-driver-name", "col-pu-date", "col-del-date", "col-status", "col-revenue",
  "col-late-fee", "col-lumper", "col-fuel", "col-repairs-maintenance", "col-other",
  "col-short-miles", "col-rate-loaded", "col-loaded-pay", "col-empty-miles", "col-rate-empty", "col-deadhead-pay", "col-gross",
  "load-costs-expand", "panel-costs-on-load",
  "panel-approx-settlement", "btn-add-cost", "btn-receipt-photo", "btn-fuel-advance",
];

const COLUMN_ORDER = [
  "load", "unit", "driver-name", "pu-date", "del-date", "status", "revenue",
  "late-fee", "lumper", "fuel", "repairs-maintenance", "other",
  "short-miles", "rate-loaded", "loaded-pay", "empty-miles", "rate-empty", "deadhead-pay", "gross",
];

function violations(board, backend) {
  const errors = [];
  for (const id of IDS) if (!board.includes(`"${id}"`)) errors.push(`missing ${id}`);
  const offsets = COLUMN_ORDER.map((id) => board.indexOf(`testId: "col-${id}"`));
  if (offsets.some((offset) => offset < 0) || offsets.some((offset, index) => index > 0 && offset <= offsets[index - 1])) errors.push("nineteen columns are not declared in locked left-to-right order");
  // Internal (client-side) sort, not server/external -- item (3)'s 13 new numeric/derived columns
  // (Short Miles, rates, pay splits) each carry their own sortValue extractor; a server sort key per
  // column would have to grow in lockstep by hand and is not the contract here.
  if (!board.includes("<ParityTable") || !board.includes("enableColumnReorder") || !board.includes("enableColumnResize") || board.includes('sortMode="external"')) errors.push("board is not a reorderable, resizable, internally-sorted ParityTable");
  if (!board.includes("<DrillKpiCard") || (board.match(/<DrillKpiCard/g) ?? []).length !== 6) errors.push("six KPIs are not DrillKpiCard buttons");
  if (!board.includes("scheduled_delivery_at") || !board.includes("actual_delivery_at") || !board.includes('actual_delivery_at ? formatDateUS(r.actual_delivery_at) : "—"')) errors.push("Del Date is not the truthful actual-delivery stop date");
  // Status = SERVICE performance (On Time / Late), computed from actual vs scheduled delivery --
  // NOT the load's lifecycle state (owner order 2026-09-04, explicit correction from the prior design).
  if (!board.includes("function serviceStatus") || !board.includes('"On Time"') || !board.includes('"Late"')) errors.push("Status column is not computed as On Time / Late service performance");
  if (!board.includes('backgroundColor: "#14314F"') || !board.includes('color: "#FFFFFF"')) errors.push("locked navy/white table header missing");
  // Drafts never shown; voided (cancelled) hidden by default, toggle-able.
  if (!backend.includes("l.status <> 'draft'") || !backend.includes("l.status <> 'cancelled'") || !backend.includes("show_voided")) errors.push("drafts-never-shown / voided-hidden-by-default filter missing");
  if (!backend.includes("repairs_maintenance_cents") || !backend.includes("linked_work_order_uuid") || !backend.includes("wo.load_id = e.load_id") || !backend.includes("wo.load_id = bl.load_id")) errors.push("direct-trip R&M must derive from same-load work-order financial links");
  if (!backend.includes("wo.load_id IS NOT NULL") || !backend.includes("wo.status <> 'cancelled'")) errors.push("R&M aggregate must exclude non-trip and cancelled work orders");
  // Honesty rule (owner order 2026-09-04): Empty Miles / Deadhead Pay render BLANK, never 0, when
  // untracked -- a 0 would claim no empty miles and underpay the driver.
  if (!backend.includes("has_deadhead_miles") || !board.includes("empty_miles == null") || !board.includes("deadhead_pay_cents == null")) errors.push("Empty Miles / Deadhead Pay honesty rule (blank, never zero) missing");
  if (board.includes('method: "POST"') || backend.includes("INSERT INTO") || backend.includes("UPDATE accounting") || backend.includes("DELETE FROM")) errors.push("read-only board introduced a writer");
  return errors;
}

function check(board, backend) {
  const errors = violations(board, backend);
  if (errors.length) throw new Error(errors.join("; "));
}

const board = fs.readFileSync(BOARD, "utf8");
const backend = fs.readFileSync(BACKEND, "utf8");

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const id of IDS) {
    try { check(board.replaceAll(id, `removed-${id}`), backend); }
    catch { caught += 1; continue; }
    throw new Error(`single-id mutation escaped: ${id}`);
  }
  const structural = [
    { board: board.replace("enableColumnReorder", ""), backend },
    { board: board.replace("<ParityTable", '<ParityTable sortMode="external"'), backend },
    { board: board.replaceAll("actual_delivery_at", "delivered_guess"), backend },
    { board: board.replace('backgroundColor: "#14314F"', 'backgroundColor: "#F7F8FA"'), backend },
    { board: board.replace("function serviceStatus", "function removedServiceStatus"), backend },
    { board, backend: backend.replaceAll("repairs_maintenance_cents", "removed_rm_cents") },
    { board, backend: backend.replaceAll("wo.load_id = e.load_id", "TRUE") },
    { board, backend: backend.replaceAll("wo.load_id = bl.load_id", "TRUE") },
    { board, backend: backend.replace("l.status <> 'draft'", "TRUE") },
    { board, backend: backend.replace("l.status <> 'cancelled'", "TRUE") },
    { board: board.replaceAll("empty_miles == null", "false"), backend },
  ];
  for (const [index, source] of structural.entries()) {
    try { check(source.board, source.backend); }
    catch { caught += 1; continue; }
    throw new Error(`structural mutation escaped: ${index + 1}`);
  }
  check(board, backend);
  console.log(`PASS verify-load-costs-board-manifest --selftest (${caught}/${IDS.length + structural.length})`);
} else {
  check(board, backend);
  console.log(`PASS verify-load-costs-board-manifest (${IDS.length}/${IDS.length} ids)`);
}
