#!/usr/bin/env node
// Guard — Samsara reverseGeo (city/state) + current-driver pairing ingest (Priority-1 completion).
// Locks the invariants so the fleet board's driver/HOS/city/state can't silently regress to blank:
//   1. Migration adds city/state/formatted_location to telematics.vehicle_locations AND surfaces them
//      on the vehicle_latest_position view.
//   2. The Samsara client fetches /fleet/vehicles/stats?types=gps,driverAssignments (the one call that
//      carries reverseGeo + the current driver).
//   3. The positions service enriches positions with city/state AND pairs the current driver into
//      telematics.vehicle_driver_assignments (the table fleet-location-hos reads).
//   4. The positions cron actually calls the stats enrichment.
//   5. The fleet-location-hos reader selects + returns city/state, and the export/board surface them
//      (no hardcoded "—" placeholder left behind).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => { console.error(`FAIL verify-samsara-stats-reversegeo-ingest: ${m}`); process.exit(1); };

// 1) Migration
const mig = read("db/migrations/202606181900_vehicle_location_reversegeo.sql");
if (!/vehicle_locations[\s\S]{0,200}ADD COLUMN IF NOT EXISTS city text/.test(mig))
  fail("migration must add telematics.vehicle_locations.city");
if (!/ADD COLUMN IF NOT EXISTS state text/.test(mig)) fail("migration must add vehicle_locations.state");
if (!/ADD COLUMN IF NOT EXISTS formatted_location text/.test(mig)) fail("migration must add vehicle_locations.formatted_location");
if (!/CREATE OR REPLACE VIEW telematics\.vehicle_latest_position[\s\S]*v\.city[\s\S]*v\.state[\s\S]*v\.formatted_location/.test(mig))
  fail("vehicle_latest_position view must surface city/state/formatted_location");

// 2) Client fetches the stats endpoint with VALID types only (gps,engineStates). driverAssignments is
//    NOT a valid /fleet/vehicles/stats type — including it 400s the whole request (the city/state bug).
const client = read("apps/backend/src/integrations/samsara/samsara-client.ts");
if (!/\/fleet\/vehicles\/stats/.test(client)) fail("client must call /fleet/vehicles/stats");
if (!/set\("types", "gps,engineStates"\)/.test(client))
  fail("stats fetch must request VALID types=gps,engineStates");
if (/set\("types", "gps,driverAssignments"\)/.test(client))
  fail("stats fetch must NOT request driverAssignments on /fleet/vehicles/stats (invalid type -> 400)");
if (!/reverseGeo/.test(client)) fail("client must parse reverseGeo");
if (!/engineStates/.test(client)) fail("client must parse engineStates (real engine_state, not derived from speed)");
if (!/listVehicleStats/.test(client)) fail("client must expose listVehicleStats()");

// 3) Positions service enriches city/state + pairs driver
const svc = read("apps/backend/src/integrations/samsara/samsara-positions.service.ts");
if (!/export async function syncSamsaraVehicleStats/.test(svc)) fail("service must export syncSamsaraVehicleStats");
if (!/INSERT INTO telematics\.vehicle_driver_assignments/.test(svc))
  fail("service must INSERT into telematics.vehicle_driver_assignments (pair current driver)");
if (!/city: stat\.city/.test(svc)) fail("service must pass stat.city into the position event");

// 4) Cron wires the enrichment
const cron = read("apps/backend/src/cron/samsara-positions-cron.ts");
if (!/syncSamsaraVehicleStats\(client, operatingCompanyId\)/.test(cron))
  fail("positions cron must call syncSamsaraVehicleStats");

// 5) Reader returns city/state; export + board surface them; no leftover placeholder
const reader = read("apps/backend/src/telematics/fleet-location-hos.service.ts");
if (!/p\.city/.test(reader) || !/p\.state/.test(reader)) fail("fleet-location-hos must SELECT p.city/p.state");
if (!/city: p\.city/.test(reader)) fail("fleet-location-hos rows must return city");
const board = read("apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx");
if (/pending the reverse-geocoding source/.test(board)) fail("Compliance board still has the city/state placeholder comment");
if (!/r\.city/.test(board) || !/r\.state/.test(board)) fail("Compliance board must render r.city/r.state");

console.log("OK verify-samsara-stats-reversegeo-ingest: reverseGeo city/state + driver pairing ingest locked.");
