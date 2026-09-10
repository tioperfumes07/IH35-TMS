#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LOADS_ROUTES = "apps/backend/src/dispatch/loads.routes.ts";
const TRIP_PAIRING = "apps/backend/src/dispatch/trip-pairing-board.service.ts";
const SAMSARA_CLIENT = "apps/backend/src/integrations/samsara/samsara-client.ts";

export function verify() {
  const errors = [];

  // 1. loads.routes.ts must coalesce city/state from vehicle_locations
  const loads = fs.readFileSync(path.join(ROOT, LOADS_ROUTES), "utf8");
  if (!loads.includes("COALESCE(p.city, loc.city)")) {
    errors.push("loads.routes.ts must COALESCE(p.city, loc.city) for dispatch board location_city");
  }
  if (!loads.includes("COALESCE(p.state, loc.state)")) {
    errors.push("loads.routes.ts must COALESCE(p.state, loc.state) for dispatch board location_state");
  }
  if (!loads.includes("LEFT JOIN LATERAL") || !loads.includes("telematics.vehicle_locations g")) {
    errors.push("loads.routes.ts must LEFT JOIN LATERAL on vehicle_locations to coalesce city/state");
  }

  // 2. trip-pairing-board.service.ts must coalesce city/state
  const trip = fs.readFileSync(path.join(ROOT, TRIP_PAIRING), "utf8");
  if (!trip.includes("COALESCE(p.city, g.city)")) {
    errors.push("trip-pairing-board.service.ts must COALESCE(p.city, g.city) for trip pairing location");
  }
  if (!trip.includes("COALESCE(p.state, g.state)")) {
    errors.push("trip-pairing-board.service.ts must COALESCE(p.state, g.state) for trip pairing location");
  }

  // 3. Samsara client must have the fallback types retry
  const client = fs.readFileSync(path.join(ROOT, SAMSARA_CLIENT), "utf8");
  if (!client.includes("gps,engineStates")) {
    errors.push("samsara-client must include the minimal fallback types set (gps,engineStates)");
  }
  if (!client.includes("typesSets")) {
    errors.push("samsara-client must have a typesSets fallback array for 400 retry");
  }

  return errors;
}

if (process.argv.includes("--selftest")) {
  const clean = verify();
  if (clean.length) {
    console.error(`SELFTEST setup failed: ${clean.join("; ")}`);
    process.exit(1);
  }
  // Plant a missing COALESCE in loads.routes.ts
  const original = fs.readFileSync(path.join(ROOT, LOADS_ROUTES), "utf8");
  const planted = original.replace("COALESCE(p.city, loc.city)", "p.city");
  fs.writeFileSync(LOADS_ROUTES, planted);
  const errors = verify();
  fs.writeFileSync(LOADS_ROUTES, original);
  if (!errors.some((e) => e.includes("COALESCE(p.city, loc.city)"))) {
    console.error("SELFTEST FAIL: planted missing COALESCE was not detected");
    process.exit(1);
  }
  console.log("SELFTEST PASS: 1/1 planted missing-COALESCE regression detected");
  process.exit(0);
}

const errors = verify();
if (errors.length) {
  console.error("verify-dispatch-live-location.mjs FAIL:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("verify-dispatch-live-location.mjs PASS");
