#!/usr/bin/env node
// ROUND-20.2 (RT-FULL-TOUR) guard. Owner ruling 2026-09-12 (verbatim): "it is only showing the
// current trip, the sb, but not the nb trip, so how is that round trips if it isnt rendering the
// entire tour, that is what this view is in essence." DISPATCH OPEN-ONLY stands everywhere else in
// Dispatch; Round Trips is the ONE exception — an OPEN tour renders WHOLE (its already-delivered
// legs included); a CLOSED tour never renders here at all. Scoped exactly via
// presettlement_link_id: a terminal-status leg is kept only when it is linked to its UNIT's still
// OPEN pre-settlement, never by status alone and never once that settlement closes.
//
// This guard checks BOTH halves of the fix (a frontend-only check would pass even if the backend
// never actually returns the rows to filter):
//   A) apps/backend/src/mdata/loads.routes.ts — the LIST select (the query Dispatch.tsx's
//      listLoads/listAllLoads actually calls, GET /api/v1/mdata/loads) projects
//      trip_type/presettlement_link_id/tour_id, and the board_scope="live" branch has an
//      include_open_tour_legs opt-in that ORs in legs linked to a still-open
//      driver_finance.driver_settlements row — never widening board_scope=live itself for every
//      OTHER caller (Kanban/List/Trip Pairing all stay OPEN-ONLY).
//   B) apps/frontend/src/pages/dispatch/RoundTrips.tsx — buildUnitPairs() actually runs the
//      presettlement-link branch, verified by EXTRACTING the real function source (TS types
//      stripped) and RUNNING it against fabricated fixtures: a delivered leg linked to its unit's
//      open tour is kept; a delivered leg linked to a settlement that is NOT in the open list
//      (i.e. closed) is dropped; an active-status leg is always kept regardless of link state.
//
// --selftest reverts (A) and (B) one at a time (in memory only, nothing written to disk) and
// requires the guard to FAIL each time.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RT_PATH = "apps/frontend/src/pages/dispatch/RoundTrips.tsx";
const BACKEND_PATH = "apps/backend/src/mdata/loads.routes.ts";

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

// --- A) backend: LIST select + include_open_tour_legs branch --------------------------------
function auditBackend(src) {
  const failures = [];
  if (!/l\.trip_type,\s*l\.presettlement_link_id,\s*l\.tour_id/.test(src)) {
    failures.push("mdata/loads.routes.ts LIST select does not project trip_type/presettlement_link_id/tour_id");
  }
  const liveBranchStart = src.indexOf('board_scope === "live"');
  const liveBranch = liveBranchStart >= 0 ? src.slice(liveBranchStart, liveBranchStart + 1800) : "";
  if (!/include_open_tour_legs/.test(liveBranch)) {
    failures.push('board_scope==="live" branch has no include_open_tour_legs opt-in');
  }
  if (!/presettlement_link_id IN/.test(liveBranch) || !/trip_closed_at IS NULL/.test(liveBranch)) {
    failures.push("include_open_tour_legs branch does not OR in legs linked to a still-open settlement");
  }
  if (!/status NOT IN \('approved', 'paid', 'cancelled', 'closed', 'final'\)/.test(liveBranch)) {
    failures.push("open-settlement subquery does not exclude closed/approved/paid/cancelled/final — a closed tour could leak back in");
  }
  return failures;
}

// --- B) frontend: buildUnitPairs, extracted and actually RUN --------------------------------
/** The header (name through the params) carries multi-line TS types (an inline object-array type,
 * bracket array types, a return-type annotation) that a handful of one-line regexes keep missing in
 * some new shape or other. Rebuilt directly instead of chased with more regexes: same 3 params,
 * same order, no types — the body (the thing actually under test) is left untouched below. */
function stripTsForEval(block, bodyStart) {
  const body = block.slice(bodyStart);
  const plainHeader = "function buildUnitPairs(loads, preSettlements, idleUnits) ";
  return (
    plainHeader +
    body
      .replace(/new Map<[^>]*>\(\)/g, "new Map()")
      .replace(/:\s*(string|number|boolean)(\s*\|\s*null)?(?=[,)\s])/g, "")
  );
}

function runBuildUnitPairs(rtSrc, loads, preSettlements, idleUnits) {
  const start = rtSrc.indexOf("function buildUnitPairs(");
  if (start < 0) throw new Error("buildUnitPairs function not found");
  // Find the parameter list's OWN closing paren by paren-depth (not the first "{" after the
  // function name — the middle param's inline `Array<{ ... }>` type has its own brace pair that
  // sits INSIDE the parens and must not be mistaken for the body's opening brace).
  let parenDepth = 0;
  let j = rtSrc.indexOf("(", start);
  for (; j < rtSrc.length; j += 1) {
    if (rtSrc[j] === "(") parenDepth += 1;
    else if (rtSrc[j] === ")") {
      parenDepth -= 1;
      if (parenDepth === 0) break;
    }
  }
  let depth = 0;
  let i = rtSrc.indexOf("{", j);
  const bodyStartAbs = i;
  for (; i < rtSrc.length; i += 1) {
    if (rtSrc[i] === "{") depth += 1;
    else if (rtSrc[i] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const block = rtSrc.slice(start, i + 1);
  const stripped = stripTsForEval(block, bodyStartAbs - start);
  // Externals buildUnitPairs's body reads: ACTIVE_STATUSES (module Set), NEEDS_RETURN_STATUSES
  // (imported Set), pairOutboundReturn (imported fn). Reimplemented here as faithful stand-ins of
  // the real roundTripsLegs.ts contract (not the thing under test — buildUnitPairs is).
  const harness = `
    const ACTIVE_STATUSES = new Set(["assigned","assigned_not_dispatched","dispatched","at_pickup","in_transit","at_delivery"]);
    const NEEDS_RETURN_STATUSES = new Set(["dispatched","at_pickup","in_transit","at_delivery"]);
    function pairOutboundReturn(unitLoads) {
      const chrono = [...unitLoads].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
      const outbound = chrono[0] ?? null;
      const returnLoad = chrono.length > 1 ? chrono[chrono.length - 1] : null;
      return { outbound, returnLoad };
    }
    ${stripped}
    return buildUnitPairs(loads, preSettlements, idleUnits);
  `;
  // eslint-disable-next-line no-new-func
  const fn = new Function("loads", "preSettlements", "idleUnits", harness);
  return fn(loads, preSettlements, idleUnits);
}

function fixture() {
  // Mirrors the live T148 tour (5809): 13563 NB closed, 13553 TR invoiced, 13595 SB in_transit —
  // all linked to the SAME open settlement S-OPEN. U2/S-CLOSED is the negative case: a delivered
  // leg linked to a settlement that has ALREADY closed (not present in the open pre-settlements
  // list at all) must never render.
  const loads = [
    { id: "L1", assigned_unit_id: "U1", status: "closed", trip_type: "NB", presettlement_link_id: "S-OPEN", created_at: "2026-09-01T00:00:00Z", assigned_unit_number: "T148", assigned_primary_driver_id: "D1", assigned_primary_driver_name: "Driver One" },
    { id: "L2", assigned_unit_id: "U1", status: "invoiced", trip_type: "TR", presettlement_link_id: "S-OPEN", created_at: "2026-09-05T00:00:00Z", assigned_unit_number: "T148", assigned_primary_driver_id: "D1", assigned_primary_driver_name: "Driver One" },
    { id: "L3", assigned_unit_id: "U1", status: "in_transit", trip_type: "SB", presettlement_link_id: "S-OPEN", created_at: "2026-09-10T00:00:00Z", assigned_unit_number: "T148", assigned_primary_driver_id: "D1", assigned_primary_driver_name: "Driver One" },
    { id: "L4", assigned_unit_id: "U2", status: "closed", trip_type: "NB", presettlement_link_id: "S-CLOSED", created_at: "2026-08-01T00:00:00Z", assigned_unit_number: "T999", assigned_primary_driver_id: "D2", assigned_primary_driver_name: "Driver Two" },
  ];
  const preSettlements = [
    { settlement_id: "S-OPEN", driver_id: "D1", first_load_id: "L1", last_load_id: "L3" },
    // S-CLOSED deliberately absent — a closed/settled tour is never in the open-by-driver list.
  ];
  return { loads, preSettlements, idleUnits: [] };
}

function auditFrontendRuntime(rtSrc) {
  const failures = [];
  const { loads, preSettlements, idleUnits } = fixture();
  let pairs;
  try {
    pairs = runBuildUnitPairs(rtSrc, loads, preSettlements, idleUnits);
  } catch (err) {
    failures.push(`buildUnitPairs threw when run against the T148-shaped fixture: ${err.message}`);
    return failures;
  }
  const u1 = pairs.find((p) => p.unitId === "U1");
  if (!u1) {
    failures.push("U1 (T148) produced no pair at all");
    return failures;
  }
  const u1Ids = new Set(u1.unitLoads.map((l) => l.id));
  if (!u1Ids.has("L1")) failures.push("U1's OPEN-tour NB leg (closed, linked to the open settlement) was dropped — status-only filtering");
  if (!u1Ids.has("L2")) failures.push("U1's OPEN-tour TR leg (invoiced, linked to the open settlement) was dropped — status-only filtering");
  if (!u1Ids.has("L3")) failures.push("U1's active SB leg was dropped — the active-status branch itself regressed");
  const u2 = pairs.find((p) => p.unitId === "U2");
  if (u2 && u2.unitLoads.some((l) => l.id === "L4")) {
    failures.push("U2's CLOSED-tour leg (linked to a settlement absent from the open list) rendered anyway — the exception is not scoped to OPEN tours only");
  }
  return failures;
}

function run() {
  const rtSrc = read(RT_PATH);
  const backendSrc = read(BACKEND_PATH);

  const failures = [...auditBackend(backendSrc), ...auditFrontendRuntime(rtSrc)];

  if (failures.length > 0) {
    console.error("verify-round-trips-full-tour FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(
    "verify-round-trips-full-tour OK — mdata/loads.routes.ts LIST select projects trip_type/presettlement_link_id/tour_id, include_open_tour_legs ORs in only still-open-tour legs; buildUnitPairs (run live against a T148-shaped fixture) keeps every leg of an open tour and drops a closed tour's leg."
  );
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  const rtSrc = read(RT_PATH);
  const backendSrc = read(BACKEND_PATH);

  // Baseline: both audits pass on the real, current source.
  assert.equal(auditBackend(backendSrc).length, 0, "backend audit should pass on real source");
  assert.equal(auditFrontendRuntime(rtSrc).length, 0, "frontend runtime audit should pass on real source");

  // MUTATION 1 — revert buildUnitPairs to the original status-only filter (no presettlement branch).
  const originalFilterBlock = `  for (const load of loads) {
    const unitId = load.assigned_unit_id;
    if (!unitId) continue;
    const isActive = ACTIVE_STATUSES.has(load.status);
    // A terminal-status leg (delivered/invoiced/closed/...) is kept ONLY when it is linked to THIS
    // unit's still-open pre-settlement — never by status alone, never for a different unit's tour,
    // never once the tour itself has closed (openSettlementIdByUnit only holds OPEN settlements).
    const linkedToOpenTour =
      load.presettlement_link_id != null && load.presettlement_link_id === openSettlementIdByUnit.get(unitId);
    if (!isActive && !linkedToOpenTour) continue;
    loadsByUnit.set(unitId, [...(loadsByUnit.get(unitId) ?? []), load]);
  }`;
  const statusOnlyBlock = `  for (const load of loads) {
    const unitId = load.assigned_unit_id;
    if (!unitId) continue;
    if (!ACTIVE_STATUSES.has(load.status)) continue;
    loadsByUnit.set(unitId, [...(loadsByUnit.get(unitId) ?? []), load]);
  }`;
  assert.equal(rtSrc.includes(originalFilterBlock), true, "selftest fixture out of sync with the real filter block");
  const mutatedRt1 = rtSrc.replace(originalFilterBlock, statusOnlyBlock);
  assert.notEqual(mutatedRt1, rtSrc, "mutation 1 did not change the source");
  assert.ok(auditFrontendRuntime(mutatedRt1).length > 0, "MUTATION 1 (status-only filter restored) escaped detection");

  // MUTATION 2 — drop the backend's include_open_tour_legs OR-clause entirely (falls back to a
  // bare status exclusion, same shape as the pre-fix branch).
  const orBlockNeedle = "if (include_open_tour_legs) {";
  assert.ok(backendSrc.includes(orBlockNeedle), "selftest fixture out of sync with the real backend branch");
  const liveBranchStart = backendSrc.indexOf('board_scope === "live"');
  const liveBranchEnd = backendSrc.indexOf("} else if (board_scope", liveBranchStart);
  const mutatedBackend2 =
    backendSrc.slice(0, liveBranchStart) +
    `board_scope === "live") {\n        values.push(DISPATCH_LIVE_EXCLUDED_STATUSES);\n        filters.push(\`NOT (l.status = ANY($\${values.length}::mdata.load_status_enum[]))\`);\n      ` +
    backendSrc.slice(liveBranchEnd);
  assert.notEqual(mutatedBackend2, backendSrc, "mutation 2 did not change the source");
  assert.ok(auditBackend(mutatedBackend2).length > 0, "MUTATION 2 (include_open_tour_legs branch removed) escaped detection");

  // MUTATION 3 — drop the trip_type/presettlement_link_id/tour_id SELECT projection.
  const projectionNeedle = "l.trip_type, l.presettlement_link_id, l.tour_id,";
  assert.ok(backendSrc.includes(projectionNeedle), "selftest fixture out of sync with the real SELECT projection");
  const mutatedBackend3 = backendSrc.replace(projectionNeedle, "");
  assert.notEqual(mutatedBackend3, backendSrc, "mutation 3 did not change the source");
  assert.ok(auditBackend(mutatedBackend3).length > 0, "MUTATION 3 (SELECT projection removed) escaped detection");

  // MUTATION 4 — the "closed tour never renders" scope: widen the open-settlement subquery to
  // match ANY settlement regardless of trip_closed_at/status (a closed tour's legs would leak in).
  const scopeNeedle = "AND s.trip_closed_at IS NULL\n                AND s.status NOT IN ('approved', 'paid', 'cancelled', 'closed', 'final')";
  assert.ok(backendSrc.includes(scopeNeedle), "selftest fixture out of sync with the real open-settlement scope");
  const mutatedBackend4 = backendSrc.replace(scopeNeedle, "");
  assert.notEqual(mutatedBackend4, backendSrc, "mutation 4 did not change the source");
  assert.ok(auditBackend(mutatedBackend4).length > 0, "MUTATION 4 (open-settlement scope widened) escaped detection");

  console.log("verify-round-trips-full-tour --selftest PASS (4/4 mutations caught)");
  process.exit(0);
}

run();
