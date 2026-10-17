#!/usr/bin/env node
// Guard — every unit on the Dispatch board shows its LIVE Samsara location whether dispatched or not (Jorge).
// /dispatch/units-without-load must JOIN telematics.vehicle_latest_position (the reverse-geo'd city/state source
// that powers the fleet board) onto EVERY unit row and return it independent of load state, with an "as of HH:MM CT"
// + stale flag. Locks the join + the per-row location object so the board can't regress to location-less rows.
//
// 443.187 (CC-2): 80e5f9bac9 (REG-002b, #21652) kept the position view as the source and COALESCEs onto the most
// recent vehicle_locations row that HAS a city/state when the latest fix has none — same rule (city/state come from
// the position view first), so `COALESCE(p.city, loc.city) AS location_city` is accepted alongside the bare form.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const ROUTES = "apps/backend/src/dispatch/loads.routes.ts";
const TABLE = "apps/frontend/src/pages/dispatch/components/UnitsWithoutLoadTable.tsx";

export function audit(routes, table) {
  const problems = [];
  // The units-without-load query must LEFT JOIN the reverse-geo position view (NOT positions/latest, which lacks city/state).
  if (!/LEFT JOIN telematics\.vehicle_latest_position p[\s\S]{0,160}p\.unit_id = u\.id/.test(routes))
    problems.push("units-without-load must LEFT JOIN telematics.vehicle_latest_position on the unit (live location source)");
  const cityOk = /(?:p\.city|COALESCE\(p\.city,\s*loc\.city\)) AS location_city/.test(routes);
  const stateOk = /(?:p\.state|COALESCE\(p\.state,\s*loc\.state\)) AS location_state/.test(routes);
  if (!cityOk || !stateOk) problems.push("units-without-load must select reverse-geo city/state from the position view");
  // Per-row location object: present whether dispatched or not, with CT timestamp + stale flag.
  if (!/location: capUtc[\s\S]{0,700}captured_at_ct/.test(routes))
    problems.push("each unit row must return a location object (city/state/lat/lng + 'as of HH:MM CT') when a fix exists");
  if (!/stale: minsAgo != null && minsAgo >/.test(routes))
    problems.push("location must carry a stale flag (gold-dot per the dispatch freshness budget)");
  if (!/Current Location/.test(table)) problems.push("UnitsWithoutLoadTable must render a 'Current Location' column");
  if (!/LocationCell/.test(table) || !/captured_at_ct/.test(table))
    problems.push("the location cell must render city/state + 'as of HH:MM CT' (+ stale dot)");
  return problems;
}

const routes = read(ROUTES);
const table = read(TABLE);

if (process.argv.includes("--selftest")) {
  const live = audit(routes, table);
  if (live.length) {
    console.error(`FAIL verify-dispatch-units-live-location --selftest: live tree not clean — ${live.join("; ")}`);
    process.exit(1);
  }
  const plants = [
    ["city no longer from the position view", routes.replace(/COALESCE\(p\.city,\s*loc\.city\) AS location_city/, "loc.city AS location_city"), table],
    ["position view join dropped", routes.replace("LEFT JOIN telematics.vehicle_latest_position p", "LEFT JOIN telematics.positions_latest p"), table],
    ["stale flag dropped", routes.replace(/stale: minsAgo != null && minsAgo >/, "stale: false && 0 >"), table],
    ["location column dropped", routes, table.replace(/Current Location/g, "Where")],
  ];
  for (const [name, r, t] of plants) {
    if (r === routes && t === table) {
      console.error(`FAIL verify-dispatch-units-live-location --selftest: plant "${name}" did not change the source — re-anchor`);
      process.exit(1);
    }
    if (audit(r, t).length === 0) {
      console.error(`FAIL verify-dispatch-units-live-location --selftest: plant "${name}" not caught`);
      process.exit(1);
    }
  }
  console.log(`verify-dispatch-units-live-location --selftest PASS (${plants.length} plants)`);
  process.exit(0);
}

const problems = audit(routes, table);
if (problems.length) {
  console.error(`FAIL verify-dispatch-units-live-location: ${problems.join("; ")}`);
  process.exit(1);
}
console.log("OK verify-dispatch-units-live-location: every dispatch unit row carries live reverse-geo location (load-independent).");
