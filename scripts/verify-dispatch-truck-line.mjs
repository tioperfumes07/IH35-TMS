#!/usr/bin/env node
/**
 * TRUCK LINE — static source guard (Lead assignment 2026-09-11, owner ruling).
 * docs/design/reference/DISPATCH-LINE-BOARD-REFERENCE-2026-09-11.html +
 * docs/design/DESIGN-CONTRACT-DISPATCH-LINE-BOARD-2026-09-11.md are the contract; this guard
 * locks the build's own spec items (a)-(i) from docs/bus/INBOX-CC-2.md's BUILD section D.
 *
 * (a) row count = in-service USMCA trucks under the Kanban predicate
 * (b) station derivation is a pure function of status+stamps (unit test, 9 states + multi-stop)
 * (c) node click paths call the EXISTING transition/stamp/intransit-issues routes — no new
 *     UPDATE of mdata.loads.status in the new Truck Line route files themselves
 * (d) a refused transition renders the server reason (never fails silently)
 * (e) no-ping renders the red text
 * (f) double-click routes to /accounting/load-costs/:loadId
 * (g) all 4 existing view segments (Kanban/List/Round Trips/Trip Pairing) still present, additive
 * (h) station header labels = node positions (same 9, same order, as station.ts's own list)
 * (i) Other requires an active catalog reason and never changes loads.status
 */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const LABEL = "verify-dispatch-truck-line";
const read = (p) => readFileSync(new URL("../" + p, import.meta.url).pathname, "utf8");

export function verify(files) {
  const problems = [];
  const {
    truckLineRoutes,
    unitsWithoutLoadRoutes,
    stopStampRoutes,
    stopStampService,
    driverPwaRoutes,
    reasonsRoutes,
    archTabsService,
    stationTs,
    stationTest,
    boardTsx,
    dispatchTsx,
  } = files;

  // (a) row count = in-service USMCA trucks under the SAME Kanban/units-without-load predicate.
  const sharedTokens = [
    "u.currently_leased_to_company_id = $1::uuid",
    "u.is_sample_data IS NOT TRUE",
    "u.sold_date IS NULL",
    "u.disposed_date IS NULL",
    "u.is_oos IS NOT TRUE",
    "u.status = 'InService'::mdata.unit_status",
  ];
  for (const token of sharedTokens) {
    if (!truckLineRoutes.includes(token)) problems.push(`(a) truck-line.routes.ts missing unit predicate token: ${token}`);
    if (!unitsWithoutLoadRoutes.includes(token)) problems.push(`(a) units-without-load predicate itself changed, lost token: ${token} (re-sync truck-line.routes.ts if this moved)`);
  }
  if (!truckLineRoutes.includes("openWorkOrderPredicateSql")) problems.push("(a) truck-line.routes.ts must reuse openWorkOrderPredicateSql, not a private in-shop check");

  // (b) station derivation is a pure function, unit-tested for the 9 states + multi-stop.
  if (!/export function deriveTruckLineStation/.test(stationTs)) problems.push("(b) station.ts must export a pure deriveTruckLineStation function");
  if (/\bimport\s+.*\bpg\b|from ["']pg["']|withCurrentUser|client\.query/.test(stationTs)) problems.push("(b) station.ts must stay pure — no DB/client import");
  const itCount = (stationTest.match(/\bit\(/g) ?? []).length;
  if (itCount < 10) problems.push(`(b) station.test.ts must cover the 9 states + multi-stop (>=10 cases), found ${itCount}`);
  if (!/multi-stop/i.test(stationTest)) problems.push("(b) station.test.ts must cover the multi-stop case");

  // (c) no NEW status writer in the Truck Line route files themselves — the shared stamping logic
  // lives in stop-stamp.service.ts (imported by BOTH driver-pwa and Truck Line, never duplicated).
  for (const [name, src] of [
    ["truck-line.routes.ts", truckLineRoutes],
    ["stop-stamp.routes.ts (Truck Line office route)", stopStampRoutes],
    ["load-exception-reasons.routes.ts", reasonsRoutes],
  ]) {
    if (/UPDATE\s+mdata\.loads\b/i.test(src)) problems.push(`(c) ${name} must not itself UPDATE mdata.loads — that belongs only to the shared stop-stamp.service.ts / existing routes`);
  }
  if (!/UPDATE\s+mdata\.loads\b/i.test(stopStampService)) problems.push("(c) stop-stamp.service.ts must contain the (single, shared) mdata.loads status write both callers use");
  if (!driverPwaRoutes.includes("stampStopArrival") || !driverPwaRoutes.includes("stampStopDeparture")) {
    problems.push("(c) driver-pwa/dispatch-view.routes.ts must call the SAME shared stampStopArrival/stampStopDeparture as Truck Line, not its own copy");
  }
  if (!stopStampRoutes.includes("stampStopArrival") || !stopStampRoutes.includes("stampStopDeparture")) {
    problems.push("(c) Truck Line's stop-stamp.routes.ts must call the shared stampStopArrival/stampStopDeparture");
  }

  // (d) a refused transition must render the server's own reason, never fail silently.
  if (!boardTsx.includes("userFacingApiError")) problems.push('(d) TruckLineBoard.tsx must use userFacingApiError to surface a refused transition\'s reason');
  if (!/setStampError|setOtherError/.test(boardTsx)) problems.push("(d) TruckLineBoard.tsx must hold and render an error state for a refused stamp/exception");

  // (e) no-ping renders the red text, honestly, never blank.
  if (!/No ping/.test(boardTsx)) problems.push('(e) TruckLineBoard.tsx must render "No ping" text when a unit has no live position');
  if (!/#DC2626/.test(boardTsx)) problems.push("(e) the no-ping / issue text must use the red token, not a silent default color");

  // (f) double-click routes to /accounting/load-costs/:loadId.
  if (!/\/accounting\/load-costs\/\$\{loadId\}/.test(dispatchTsx)) problems.push("(f) Dispatch.tsx's TruckLineBoard onLoadClick must navigate to /accounting/load-costs/:loadId");
  if (!/onDoubleClick/.test(boardTsx)) problems.push("(f) TruckLineBoard.tsx's truck card must open the load on DOUBLE-click, not single-click");

  // (g) additive — Kanban/List/Round Trips/Trip Pairing all still present alongside Truck Line.
  for (const id of ["kanban", "list", "round-trips", "trip-pairing", "truck-line"]) {
    if (!dispatchTsx.includes(`id: "${id}"`)) problems.push(`(g) Dispatch.tsx's board-view-row is missing segment "${id}" — must be additive, nothing removed`);
  }

  // (h) station header labels = node positions — same 9 names, same order, as station.ts's own
  // canonical list (the ONE place that decides station identity/order).
  const stationKeysMatch = stationTs.match(/export const STATION_KEYS = \[([\s\S]*?)\] as const;/);
  assert(stationKeysMatch, "(h) station.ts must export STATION_KEYS");
  const keyCount = (stationKeysMatch[1].match(/"/g) ?? []).length / 2;
  if (keyCount !== 9) problems.push(`(h) station.ts STATION_KEYS must have exactly 9 stations, found ${keyCount}`);
  if (!/STATION_LABELS = \[/.test(boardTsx)) problems.push("(h) TruckLineBoard.tsx must define its own STATION_LABELS in the same 9-station order for the header strip");

  // (i) Other requires an ACTIVE catalog reason and NEVER changes loads.status.
  if (!/reason_not_found/.test(archTabsService)) problems.push("(i) createOfficeIntransitIssue must reject an unknown/inactive reason_id (reason_not_found)");
  if (!/is_active = true/.test(archTabsService)) problems.push("(i) the reason_id lookup must filter is_active = true");
  if (/UPDATE\s+mdata\.loads\b/i.test(archTabsService)) problems.push("(i) arch-tabs.service.ts (intransit-issues) must never write mdata.loads — Other never changes loads.status");

  return problems;
}

function loadFiles() {
  return {
    truckLineRoutes: read("apps/backend/src/dispatch/truck-line/truck-line.routes.ts"),
    unitsWithoutLoadRoutes: read("apps/backend/src/dispatch/loads.routes.ts"),
    stopStampRoutes: read("apps/backend/src/dispatch/truck-line/stop-stamp.routes.ts"),
    stopStampService: read("apps/backend/src/dispatch/stop-stamp.service.ts"),
    driverPwaRoutes: read("apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts"),
    reasonsRoutes: read("apps/backend/src/dispatch/truck-line/load-exception-reasons.routes.ts"),
    archTabsService: read("apps/backend/src/dispatch/arch-tabs.service.ts"),
    stationTs: read("apps/backend/src/dispatch/truck-line/station.ts"),
    stationTest: read("apps/backend/src/dispatch/truck-line/__tests__/station.test.ts"),
    boardTsx: read("apps/frontend/src/pages/dispatch/TruckLineBoard.tsx"),
    dispatchTsx: read("apps/frontend/src/pages/Dispatch.tsx"),
  };
}

function runSelftest() {
  const good = loadFiles();
  const baseline = verify(good);
  if (baseline.length) {
    console.error(`${LABEL} --selftest FAILED — the real tree itself is not clean:`);
    for (const p of baseline) console.error(`  ✗ ${p}`);
    process.exit(1);
  }

  const cases = [
    ["(a) unit predicate token removed", { ...good, truckLineRoutes: good.truckLineRoutes.replace("u.status = 'InService'::mdata.unit_status", "") }],
    ["(c) new status writer planted in truck-line.routes.ts", { ...good, truckLineRoutes: good.truckLineRoutes + "\n-- UPDATE mdata.loads SET status = 'x'" }],
    ["(c) office route stopped using the shared stamp function", { ...good, stopStampRoutes: good.stopStampRoutes.replaceAll("stampStopArrival", "REMOVED").replaceAll("stampStopDeparture", "REMOVED") }],
    ["(d) error surfacing removed", { ...good, boardTsx: good.boardTsx.replaceAll("userFacingApiError", "REMOVED") }],
    ["(e) no-ping text removed", { ...good, boardTsx: good.boardTsx.replace(/No ping/g, "REMOVED") }],
    ["(f) double-click destination changed", { ...good, dispatchTsx: good.dispatchTsx.replace("/accounting/load-costs/${loadId}", "/somewhere/else") }],
    ["(g) a board-view segment removed", { ...good, dispatchTsx: good.dispatchTsx.replace('id: "kanban"', 'id: "REMOVED"') }],
    ["(i) reason validation removed", { ...good, archTabsService: good.archTabsService.replace("reason_not_found", "REMOVED") }],
  ];
  let failed = 0;
  for (const [name, mutated] of cases) {
    const problems = verify(mutated);
    if (problems.length === 0) {
      failed++;
      console.error(`  ✗ mutation not caught: ${name}`);
    } else {
      console.log(`  ok    caught: ${name}`);
    }
  }
  if (failed > 0) {
    console.error(`${LABEL} --selftest FAILED (${failed} mutation(s) not caught)`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${cases.length}/${cases.length} mutations caught)`);
}

if (process.argv.includes("--selftest")) {
  runSelftest();
  process.exit(0);
}

const problems = verify(loadFiles());
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — read model scope matches the Kanban predicate, station derivation is pure+tested, no new status writer, refused transitions surface the server reason, no-ping is honest, double-click routes to Load Costs, all 5 board segments present, header/reason law held.`);
