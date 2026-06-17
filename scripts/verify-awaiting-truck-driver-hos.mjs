#!/usr/bin/env node
// Awaiting-truck Driver+HOS guard — an unloaded truck's row shows its DEFAULT driver (and that
// driver's HOS clocks), sourced from mdata.units.assigned_driver_id (not the absent load's driver).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => {
  console.error(`FAIL verify-awaiting-truck-driver-hos: ${m}`);
  process.exit(1);
};

// Backend: units-without-load joins the unit's default driver + returns driver_id.
const route = read("apps/backend/src/dispatch/loads.routes.ts");
if (!/LEFT JOIN mdata\.drivers ud ON ud\.id = u\.assigned_driver_id/.test(route)) {
  fail("units-without-load must join the unit's default driver (mdata.units.assigned_driver_id)");
}
if (!/ud\.id::text AS driver_id/.test(route)) fail("units-without-load must return driver_id");

// Frontend: type carries driver_id; the awaiting-truck row binds it; HOS fetch includes it.
const api = read("apps/frontend/src/api/dispatch.ts");
if (!/driver_id: string \| null/.test(api)) fail("UnitsWithoutLoad type must include driver_id");
const board = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
if (!/assigned_primary_driver_id: unit\.driver_id/.test(board)) fail("unitToBoardRow must bind assigned_primary_driver_id = unit.driver_id");
if (!/for \(const unit of unassignedUnits\)[\s\S]{0,120}unit\.driver_id/.test(board)) {
  fail("the HOS driver-id set must include awaiting trucks' default drivers");
}

console.log("PASS verify-awaiting-truck-driver-hos");
