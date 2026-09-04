#!/usr/bin/env node
import fs from "node:fs";

const BOARD = "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx";
const BACKEND = "apps/backend/src/accounting/load-costs-board.routes.ts";

const IDS = [
  "load-costs-shell", "load-costs-back", "load-costs-title", "load-costs-topbar",
  "load-costs-pill-in_motion", "load-costs-pill-delivered_open", "load-costs-pill-all_open", "load-costs-pill-this_week",
  "kpi-loads-in-motion", "kpi-revenue-booked", "kpi-costs-recorded", "kpi-driver-pay", "kpi-approx-margin", "kpi-bank-unmatched",
  "col-load", "col-status", "col-pickup-date", "col-projected-delivery", "col-delivered", "col-route-crew",
  "col-revenue", "col-costs", "col-late-fee", "col-lumper", "col-fuel", "col-rm-exp", "col-repairs-maintenance", "col-driver", "col-margin", "load-costs-expand", "panel-costs-on-load",
  "panel-approx-settlement", "btn-add-cost", "btn-receipt-photo", "btn-fuel-advance",
];

const COLUMN_ORDER = ["load", "status", "pickup-date", "projected-delivery", "delivered", "route-crew", "revenue", "costs", "late-fee", "lumper", "fuel", "rm-exp", "repairs-maintenance", "driver", "margin"];

function violations(board, backend) {
  const errors = [];
  for (const id of IDS) if (!board.includes(`"${id}"`)) errors.push(`missing ${id}`);
  const offsets = COLUMN_ORDER.map((id) => board.indexOf(`testId:\"col-${id}\"`));
  if (offsets.some((offset) => offset < 0) || offsets.some((offset, index) => index > 0 && offset <= offsets[index - 1])) errors.push("fifteen columns are not declared in locked left-to-right order");
  if (!board.includes("<ParityTable") || !board.includes("enableColumnReorder") || !board.includes('sortMode="external"') || !board.includes("onSortChange=")) errors.push("board is not a reorderable ParityTable with external/server sort");
  if (!board.includes("<DrillKpiCard") || (board.match(/<DrillKpiCard/g) ?? []).length !== 6) errors.push("six KPIs are not DrillKpiCard buttons");
  if (!board.includes("scheduled_delivery_at") || !board.includes("actual_delivery_at") || !board.includes('r.actual_delivery_at?formatDateUS(r.actual_delivery_at):"—"')) errors.push("projected/delivered dates are not truthful stop dates");
  if (!board.includes('backgroundColor:"#14314F"') || !board.includes('color:"#FFFFFF"')) errors.push("locked navy/white table header missing");
  if (!backend.includes("load_costs_sort") || !backend.includes("ORDER BY ${sortSql}")) errors.push("server sort contract missing");
  if (!backend.includes("repairs_maintenance_cents") || !backend.includes("linked_work_order_uuid") || !backend.includes("wo.load_id = e.load_id") || !backend.includes("wo.load_id = bl.load_id")) errors.push("direct-trip R&M must derive from same-load work-order financial links");
  if (!backend.includes("wo.load_id IS NOT NULL") || !backend.includes("wo.status <> 'cancelled'")) errors.push("R&M aggregate must exclude non-trip and cancelled work orders");
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
    { board: board.replace('sortMode="external"', 'sortMode="internal"'), backend },
    { board: board.replaceAll("actual_delivery_at", "delivered_guess"), backend },
    { board: board.replace('backgroundColor:"#14314F"', 'backgroundColor:"#F7F8FA"'), backend },
    { board, backend: backend.replaceAll("repairs_maintenance_cents", "removed_rm_cents") },
    { board, backend: backend.replaceAll("wo.load_id = e.load_id", "TRUE") },
    { board, backend: backend.replaceAll("wo.load_id = bl.load_id", "TRUE") },
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
