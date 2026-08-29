#!/usr/bin/env node
/**
 * SCEN01-HOP1-COST-LINES-PATCH-SILENT-DROP ratchet.
 *
 * `PATCH /api/v1/safety/accidents/:id` has always validated a `cost_lines` array in its body schema
 * (the office edit drawer sends the full Section A/B line set on every "Save Changes"), but the handler
 * only ever wrote the accident_reports column whitelist — cost_lines was parsed and then silently
 * discarded. The request returns 200 and the UI shows an "Accident report saved" toast; the cost line
 * the user just typed is gone on the next load. Live-reproduced (CC-3, SCEN-01 hop 1, 2026-08-29):
 * added a $850.00 "Driver Accident Damages & Repairs" category line, saved, reloaded — 0 rows in
 * `safety.accident_cost_lines` for that accident both times.
 *
 * This is the same silent-failure family as BOOKLOAD-OVERRIDE-DISPATCH-DEAD-CLICK / FAIL-D2: a 200
 * response the caller reasonably reads as success while the actual write never happened.
 *
 * A first fix attempt used DELETE + re-INSERT (replace-all) and regressed into a SECOND live 500:
 * `ih35_app` has no DELETE grant on this table (INSERT/SELECT/UPDATE only, verified live via
 * information_schema.role_table_grants) — the table is void-not-delete like every other
 * ledger-adjacent table here, it just has no void column yet. The real fix is append-only
 * reconciliation (INSERT only a submitted line not already present by exact tuple), never DELETE.
 * This guard locks BOTH failure modes: no cost_lines handling at all, and a DELETE regression.
 *
 * Static only — no DB, no network, no build. Asserts the PATCH handler's own function body (not the
 * POST/create handler, which already does this correctly) references `cost_lines`, inserts into
 * `safety.accident_cost_lines`, and never deletes from it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/safety/safety.routes.ts";

const src = readFileSync(join(repoRoot, TARGET), "utf8");

// Strip comments so documentation mentioning cost_lines can't fake a pass, while preserving newlines
// so any reported line numbers stay exact.
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));

const ROUTE_MARKER = `app.patch("/api/v1/safety/accidents/:id"`;
const routeStart = code.indexOf(ROUTE_MARKER);
if (routeStart === -1) {
  console.error(`FAIL: could not find the accident PATCH route registration (${ROUTE_MARKER}) in ${TARGET}`);
  process.exit(1);
}
// The next top-level route registration after this one bounds the handler body. Accidents has a
// sibling PATCH .../status route right after; use it (or the accidents-list GET further down) as the
// end marker, falling back to +8000 chars if the file is restructured.
const nextRouteMarkers = [`app.patch("/api/v1/safety/accidents/:id/status"`, `app.get("/api/v1/safety/accidents"`];
let routeEnd = code.length;
for (const marker of nextRouteMarkers) {
  const idx = code.indexOf(marker, routeStart + ROUTE_MARKER.length);
  if (idx !== -1) routeEnd = Math.min(routeEnd, idx);
}
if (routeEnd === code.length) routeEnd = Math.min(code.length, routeStart + 8000);

const handlerBody = code.slice(routeStart, routeEnd);

const failures = [];
if (!/cost_lines/.test(handlerBody)) {
  failures.push("the PATCH /api/v1/safety/accidents/:id handler never references cost_lines — a client-submitted Section A/B line set has nowhere to go");
}
if (!/accident_cost_lines/.test(handlerBody)) {
  failures.push("the PATCH /api/v1/safety/accidents/:id handler never touches safety.accident_cost_lines — cost lines validated by the body schema are silently dropped on update");
}
if (!/INSERT INTO safety\.accident_cost_lines/.test(handlerBody)) {
  failures.push("the PATCH handler references accident_cost_lines but has no INSERT — cost lines are validated but never written on update");
}
if (/DELETE\s+FROM\s+safety\.accident_cost_lines/i.test(handlerBody)) {
  failures.push("the PATCH handler DELETEs from safety.accident_cost_lines — ih35_app has no DELETE grant on this table (verified live, 42501), and the table has no void column; use append-only reconciliation instead");
}

if (failures.length > 0) {
  console.error("FAIL: verify-safety-accident-patch-persists-cost-lines");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify-safety-accident-patch-persists-cost-lines OK — PATCH /api/v1/safety/accidents/:id persists cost_lines to safety.accident_cost_lines");
