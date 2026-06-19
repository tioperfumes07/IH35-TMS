#!/usr/bin/env node
// Guard — every unit on the Dispatch board shows its LIVE Samsara location whether dispatched or not (Jorge).
// /dispatch/units-without-load must JOIN telematics.vehicle_latest_position (the reverse-geo'd city/state source
// that powers the fleet board) onto EVERY unit row and return it independent of load state, with an "as of HH:MM CT"
// + stale flag. Locks the join + the per-row location object so the board can't regress to location-less rows.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => { console.error(`FAIL verify-dispatch-units-live-location: ${m}`); process.exit(1); };

const routes = read("apps/backend/src/dispatch/loads.routes.ts");
// The units-without-load query must LEFT JOIN the reverse-geo position view (NOT positions/latest, which lacks city/state).
if (!/LEFT JOIN telematics\.vehicle_latest_position p[\s\S]{0,160}p\.unit_id = u\.id/.test(routes))
  fail("units-without-load must LEFT JOIN telematics.vehicle_latest_position on the unit (live location source)");
if (!/p\.city AS location_city/.test(routes) || !/p\.state AS location_state/.test(routes))
  fail("units-without-load must select reverse-geo city/state from the position view");
// Per-row location object: present whether dispatched or not, with CT timestamp + stale flag.
if (!/location: capUtc[\s\S]{0,700}captured_at_ct/.test(routes))
  fail("each unit row must return a location object (city/state/lat/lng + 'as of HH:MM CT') when a fix exists");
if (!/stale: minsAgo != null && minsAgo >/.test(routes))
  fail("location must carry a stale flag (gold-dot per the dispatch freshness budget)");

const table = read("apps/frontend/src/pages/dispatch/components/UnitsWithoutLoadTable.tsx");
if (!/Current Location/.test(table)) fail("UnitsWithoutLoadTable must render a 'Current Location' column");
if (!/LocationCell/.test(table) || !/captured_at_ct/.test(table))
  fail("the location cell must render city/state + 'as of HH:MM CT' (+ stale dot)");

console.log("OK verify-dispatch-units-live-location: every dispatch unit row carries live reverse-geo location (load-independent).");
