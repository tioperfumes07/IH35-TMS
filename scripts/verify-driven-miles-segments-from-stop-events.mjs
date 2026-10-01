#!/usr/bin/env node
/**
 * ROUND 306 E-05 — GUARD.
 * FAILS IF real-driven-miles.service.ts:
 *   1. stops feature-detecting telematics.unit_stop_events (a missing table must never crash the cron);
 *   2. runs the fence-bounded path when the stop table exists (two engines for one fact);
 *   3. builds a stop-to-stop segment without READ odometers at both ends, or reports a negative delta;
 *   4. lets a load with fence-bounded segments also receive stop segments (double-counted miles).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const FILE = resolve(ROOT, "apps/backend/src/integrations/samsara/geofences/real-driven-miles.service.ts");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/--.*$/gm, "");

export function check(raw) {
  const src = stripComments(raw);
  const p = [];
  if (!/table_schema = 'telematics' AND table_name = 'unit_stop_events'/.test(src)) p.push("unit_stop_events is no longer feature-detected.");
  if (!/if \(await unitStopEventsTableExists\(client\)\) \{\s*return \{ source: "unit_stop_events", segments: await materializeStopToStopSegments/.test(src)) p.push("the stop table no longer takes over from the fence path when it exists.");
  const stop = src.slice(src.indexOf("export async function materializeStopToStopSegments("), src.indexOf("async function materializeFenceBoundedSegments("));
  if (!/o\.from_odo IS NOT NULL AND o\.to_odo IS NOT NULL/.test(stop) || !/o\.to_odo >= o\.from_odo/.test(stop)) p.push("a stop segment can be written without two READ odometers, or with a negative delta.");
  if (!/NOT EXISTS \(\s*SELECT 1 FROM telematics\.load_odometer_segments old/.test(stop)) p.push("a load with fence-bounded segments can also receive stop segments.");
  return p;
}

function selftest() {
  const g = readFileSync(FILE, "utf8");
  const cases = [
    [g, false],
    [g.replace("table_name = 'unit_stop_events'", "table_name = 'x'"), true],
    [g.replace("o.from_odo IS NOT NULL AND o.to_odo IS NOT NULL", "true"), true],
    [g.replace("AND o.to_odo >= o.from_odo", ""), true],
    [g.replace("SELECT 1 FROM telematics.load_odometer_segments old", "SELECT 1 FROM x old"), true],
  ];
  return cases.every(([s, f]) => (check(s).length > 0) === f);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-driven-miles-segments-from-stop-events selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const p = check(readFileSync(FILE, "utf8"));
  console.log(p.length ? `verify-driven-miles-segments-from-stop-events FAILED:\n  - ${p.join("\n  - ")}` : "verify-driven-miles-segments-from-stop-events: OK -- stop table feature-detected and authoritative, READ odometers only, no double count.");
  process.exit(p.length ? 1 : 0);
}
