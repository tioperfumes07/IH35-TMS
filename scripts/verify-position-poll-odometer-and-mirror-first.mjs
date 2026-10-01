#!/usr/bin/env node
/**
 * ROUND 306 E-01 — GUARD.
 * FAILS IF:
 *   1. the per-fix pull goes back to /fleet/vehicles/locations (no odometer) or drops the
 *      obdOdometerMeters decoration;
 *   2. syncSamsaraVehicleLocations stops passing the fix's own odometer_mi to the ingest;
 *   3. any of the three readers that broke on T122's stale id joins integrations.samsara_vehicles
 *      on mdata.units.samsara_vehicle_id directly instead of mirror-first (local_unit_id).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const SRC = (p) => resolve(ROOT, "apps/backend/src", p);
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/--.*$/gm, "");
const FILES = {
  client: "integrations/samsara/samsara-client.ts",
  positions: "integrations/samsara/samsara-positions.service.ts",
  pm: "maint/pm.routes.ts",
  pwa: "driver/pwa-live.routes.ts",
  worker: "jobs/samsara-position-poll-worker.ts",
};

export function check(src) {
  const p = [];
  const client = stripComments(src.client);
  const fn = client.match(/async function fetchSamsaraLocationsPage\([\s\S]*?\n\}\n/);
  if (!fn || !/\/fleet\/vehicles\/stats\/feed/.test(fn[0]) || !/"decorations", "obdOdometerMeters"/.test(fn[0])) p.push("the per-fix pull is no longer stats/feed with the obdOdometerMeters decoration.");
  if (/\/fleet\/vehicles\/locations`/.test(client)) p.push("/fleet/vehicles/locations (no odometer) is called again.");
  if (!/odometer_mi: location\.odometer_mi \?\? null/.test(stripComments(src.positions))) p.push("syncSamsaraVehicleLocations no longer stores the fix's own odometer.");
  for (const k of ["pm", "pwa"]) {
    const s = stripComments(src[k]);
    if (/sv\.samsara_vehicle_id = u\.samsara_vehicle_id|u\.samsara_vehicle_id = sv\.samsara_vehicle_id/.test(s) || !/local_unit_id = u\.id/.test(s)) p.push(`${FILES[k]} is no longer mirror-first.`);
  }
  if (!/WHERE sv\.local_unit_id = u\.id/.test(stripComments(src.worker))) p.push(`${FILES.worker} no longer labels with the mirror's live id.`);
  return p;
}

const load = () => Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, readFileSync(SRC(f), "utf8")]));

function selftest() {
  const good = load();
  const mut = (k, a, b) => ({ ...good, [k]: good[k].split(a).join(b) });
  const cases = [
    [good, false],
    [mut("client", '"decorations", "obdOdometerMeters"', '"x", "y"'), true],
    [mut("client", "/fleet/vehicles/stats/feed`", "/fleet/vehicles/locations`"), true],
    [mut("positions", "odometer_mi: location.odometer_mi ?? null", "odometer_mi: null"), true],
    [mut("pm", "local_unit_id = u.id", "x = y"), true],
    [mut("worker", "WHERE sv.local_unit_id = u.id", "WHERE true"), true],
  ];
  return cases.every(([s, f]) => (check(s).length > 0) === f);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-position-poll-odometer-and-mirror-first selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const p = check(load());
  console.log(p.length ? `verify-position-poll-odometer-and-mirror-first FAILED:\n  - ${p.join("\n  - ")}` : "verify-position-poll-odometer-and-mirror-first: OK -- every fix requests the odometer decoration; T122-class readers are mirror-first.");
  process.exit(p.length ? 1 : 0);
}
