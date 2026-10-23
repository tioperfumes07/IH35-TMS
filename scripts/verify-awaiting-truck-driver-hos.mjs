#!/usr/bin/env node
// Awaiting-truck Driver+HOS guard — an unloaded truck's row shows its CURRENT driver (and that driver's HOS clocks).
// LEAD 443.231b (27dbccfd91): the driver is THE unit→driver derivation Truck Line AVAILABLE uses — unitCurrentDriverSql
// (open VDA, else last-delivered primary) — never mdata.units.assigned_driver_id (0% populated on prod: every Unassigned
// row showed "—" while Truck Line named the driver). LEAD 443.265-F (CC-2): this guard still asserted the retired
// assigned_driver_id join, so it was red on main and had been baselined; it now asserts the current required source and
// refuses the retired one. --selftest plants each regression.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const LABEL = "verify-awaiting-truck-driver-hos";

export function awaitingTruckDriverFailures({ route, canonicalSrc, inServiceSrc, api, board }) {
  const f = [];
  // Backend: units-without-load derives the unit's current driver through THE shared derivation + returns driver_id.
  if (!/\$\{unitCurrentDriverSql\("u", "\$1::uuid"\)\}/.test(route)) {
    f.push("units-without-load must derive the unit's driver through unitCurrentDriverSql (the Truck Line AVAILABLE derivation)");
  }
  if (/ud\.id = u\.assigned_driver_id/.test(route)) {
    f.push("units-without-load must not join mdata.units.assigned_driver_id (0% populated — every row reads \"—\")");
  }
  // ACTIVE units only — Awaiting must not pull Sold/Totaled/OutOfService/InMaintenance trucks
  // (the active/inactive desync that inflated the count).
  // LEAD 443.206 D3: through THE board unit gate (canonicalBoardUnitGateSql carries status = 'InService').
  // 443.231b: the route may mount the gate through the shared UNIT_IN_SERVICE_SQL (unit-in-service.ts) — accepted only
  // while that constant itself still mounts canonicalBoardUnitGateSql("u", "$1::uuid").
  const viaShared = /WHERE \$\{UNIT_IN_SERVICE_SQL\}/.test(route) && /\$\{canonicalBoardUnitGateSql\("u", "\$1::uuid"\)\}/.test(inServiceSrc ?? "");
  const inline = /WHERE \$\{canonicalBoardUnitGateSql\("u", "\$1::uuid"\)\}/.test(route);
  if (!(inline || viaShared) || !/\.status = 'InService'::mdata\.unit_status/.test(canonicalSrc)) {
    f.push("units-without-load must filter to active trucks only (u.status = 'InService')");
  }
  if (!/ud\.id::text AS driver_id/.test(route)) f.push("units-without-load must return driver_id");
  // Frontend: type carries driver_id; the awaiting-truck row binds it; HOS renders per row from it.
  if (!/driver_id: string \| null/.test(api)) f.push("UnitsWithoutLoad type must include driver_id");
  if (!/assigned_primary_driver_id: unit\.driver_id/.test(board)) f.push("unitToBoardRow must bind assigned_primary_driver_id = unit.driver_id");
  // REALIGNED 2026-06-17: the 6 Samsara HOS columns render PER ROW via DriverHosClockValue(driverId=
  // load.assigned_primary_driver_id), so an awaiting truck's row — bound to unit.driver_id above — shows that driver's HOS.
  if (!/<DriverHosClockValue[\s\S]{0,200}driverId=\{load\.assigned_primary_driver_id\}/.test(board)) {
    f.push("the board's HOS columns must render per-row via DriverHosClockValue(driverId=load.assigned_primary_driver_id) so awaiting trucks show their driver's HOS");
  }
  return f;
}

const sources = {
  route: read("apps/backend/src/dispatch/loads.routes.ts"),
  canonicalSrc: read("apps/backend/src/dispatch/canonical-active-load-set.ts"),
  inServiceSrc: read("apps/backend/src/dispatch/unit-in-service.ts"),
  api: read("apps/frontend/src/api/dispatch.ts"),
  board: read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx"),
};

if (process.argv.includes("--selftest")) {
  const real = awaitingTruckDriverFailures(sources);
  if (real.length) { console.error(`${LABEL} --selftest FAIL — real tree not clean: ${real[0]}`); process.exit(1); }
  const plants = [
    ["the shared driver derivation removed", { ...sources, route: sources.route.replace('${unitCurrentDriverSql("u", "$1::uuid")}', "") }],
    ["the retired assigned_driver_id join re-added", { ...sources, route: sources.route.replace('${unitCurrentDriverSql("u", "$1::uuid")}', '${unitCurrentDriverSql("u", "$1::uuid")}\n          LEFT JOIN mdata.drivers ud ON ud.id = u.assigned_driver_id') }],
    ["the shared in-service gate loses the board unit gate", { ...sources, inServiceSrc: sources.inServiceSrc.replace('${canonicalBoardUnitGateSql("u", "$1::uuid")}', "true") }],
    ["the route drops the in-service gate", { ...sources, route: sources.route.replace("WHERE ${UNIT_IN_SERVICE_SQL}", "WHERE true") }],
    ["driver_id no longer returned", { ...sources, route: sources.route.replace("ud.id::text AS driver_id", "NULL::text AS driver_id") }],
    ["the board stops binding the unit's driver", { ...sources, board: sources.board.replace("assigned_primary_driver_id: unit.driver_id", "assigned_primary_driver_id: null") }],
  ];
  for (const [name, mutated] of plants) {
    const changed = Object.keys(mutated).some((k) => mutated[k] !== sources[k]);
    if (!changed) { console.error(`${LABEL} --selftest FAIL — plant did not apply: ${name}`); process.exit(1); }
    if (awaitingTruckDriverFailures(mutated).length === 0) { console.error(`${LABEL} --selftest FAIL — plant escaped: ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} --selftest PASS (${plants.length}/${plants.length} plants caught; real tree clean)`);
  process.exit(0);
}

const failures = awaitingTruckDriverFailures(sources);
if (failures.length) {
  for (const m of failures) console.error(`FAIL ${LABEL}: ${m}`);
  process.exit(1);
}
console.log(`PASS ${LABEL}`);
