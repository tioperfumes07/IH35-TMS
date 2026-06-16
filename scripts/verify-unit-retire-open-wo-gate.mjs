#!/usr/bin/env node
/**
 * verify-unit-retire-open-wo-gate.mjs
 * CI guard (WF-064): the unit PATCH route must block Sold/Transferred when the unit
 * has an OPEN work order, returning E_UNIT_HAS_OPEN_WO, using the canonical open-WO
 * status list. Fails if any piece of the gate is removed or the gate is widened to
 * Damaged/OutOfService (which are intentionally NOT gated).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const errors = [];
const check = (cond, msg) => {
  if (!cond) errors.push(msg);
};

const routes = read("apps/backend/src/mdata/units.routes.ts");
check(/RETIRE_GATE_STATUSES\s*=\s*new Set\(\[\s*"Sold",\s*"Transferred"\s*\]\)/.test(routes),
  'units.routes.ts: RETIRE_GATE_STATUSES must be exactly {"Sold","Transferred"} (do not gate Damaged/OutOfService).');
check(routes.includes("countOpenWorkOrdersForUnit"),
  "units.routes.ts: PATCH handler must call countOpenWorkOrdersForUnit for the retire gate.");
check(routes.includes('error: "E_UNIT_HAS_OPEN_WO"') && routes.includes("reply.code(409)"),
  "units.routes.ts: must return 409 E_UNIT_HAS_OPEN_WO when an open WO blocks the status change.");

const kpis = read("apps/backend/src/kpi/canonical-kpis.ts");
check(/export async function countOpenWorkOrdersForUnit/.test(kpis),
  "canonical-kpis.ts: countOpenWorkOrdersForUnit must exist.");
check(/countOpenWorkOrdersForUnit[\s\S]*OPEN_MAINTENANCE_WO_STATUSES/.test(kpis),
  "canonical-kpis.ts: countOpenWorkOrdersForUnit must reuse OPEN_MAINTENANCE_WO_STATUSES (no ad-hoc status list).");

const modal = read("apps/frontend/src/components/vehicle-profile/StatusChangeModal.tsx");
check(modal.includes("E_UNIT_HAS_OPEN_WO"),
  "StatusChangeModal.tsx: must surface the E_UNIT_HAS_OPEN_WO 409 to the operator.");

if (errors.length > 0) {
  console.error("verify-unit-retire-open-wo-gate FAIL:");
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}
console.log("verify-unit-retire-open-wo-gate OK — Sold/Transferred blocked on open WO via canonical status list.");
