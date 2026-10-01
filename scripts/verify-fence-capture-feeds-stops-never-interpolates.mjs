#!/usr/bin/env node
/**
 * ROUND 306 E-04 — GUARD.
 * FAILS IF:
 *   1. the geofence odometer capture writer computes an odometer between two readings again
 *      (R-02: READ or ABSENT) -- no 'interpolated' branch, no before/after bracket laterals;
 *   2. loadFenceCapturesForStop returns a number from anything but a real_obd capture;
 *   3. the E-03 consumer stops resolving the containing fence by its own radius, stops handing the
 *      fence id to loadFenceCapturesForStop, or resolves the driver without driverAtTimeSql.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const CAP = resolve(ROOT, "apps/backend/src/integrations/samsara/geofences/geofence-odometer-capture.service.ts");
const STOPS = resolve(ROOT, "apps/backend/src/telematics/unit-stops.service.ts");
const E03 = resolve(ROOT, "apps/backend/src/telematics/stop-odometer-capture.service.ts");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/--.*$/gm, "");

export function check(cap, stops, e03) {
  const p = [];
  const c = stripComments(cap);
  if (/THEN 'interpolated'|before_r|after_r/.test(c)) p.push("the capture writer interpolates an odometer again (R-02).");
  if (!/const real = r\.odometer_source === "real_obd" && r\.odometer_mi != null;/.test(c) || !/odometer_mi: real \? Number\(r\.odometer_mi\) : null/.test(c)) p.push("loadFenceCapturesForStop can return a non-real odometer.");
  const s = stripComments(stops);
  if (!/metres <= Number\(g\.radius_m\)/.test(s)) p.push("unit-stops no longer checks the stop is inside the fence's own radius.");
  if (!/loadFenceCapturesForStop\(/.test(s) || !/geofenceId: String\(g\.geofence_id\)/.test(s)) p.push("unit-stops no longer hands the fence id to the E-04 captures.");
  if (!/driverAtTimeSql\(/.test(s)) p.push("unit-stops resolves the driver without driverAtTimeSql.");
  if (!/AS radius_m/.test(stripComments(e03))) p.push("geofenceForStopSql no longer returns the fence radius.");
  return p;
}

function selftest() {
  const [a, b, d] = [CAP, STOPS, E03].map((f) => readFileSync(f, "utf8"));
  const cases = [
    [[a, b, d], false],
    [[a + "\nconst x = `WHEN y THEN 'interpolated'`;", b, d], true],
    [[a.replace("odometer_mi: real ? Number(r.odometer_mi) : null", "odometer_mi: Number(r.odometer_mi)"), b, d], true],
    [[a, b.replace("metres <= Number(g.radius_m)", "true"), d], true],
    [[a, b.replace("driverAtTimeSql(", "x("), d], true],
    [[a, b, d.replace("AS radius_m", "AS r")], true],
  ];
  return cases.every(([args, f]) => (check(...args).length > 0) === f);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-fence-capture-feeds-stops-never-interpolates selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const p = check(...[CAP, STOPS, E03].map((f) => readFileSync(f, "utf8")));
  console.log(p.length ? `verify-fence-capture-feeds-stops-never-interpolates FAILED:\n  - ${p.join("\n  - ")}` : "verify-fence-capture-feeds-stops-never-interpolates: OK -- READ or ABSENT crossings, fence id handed to E-03 stops, driver-at-time shared.");
  process.exit(p.length ? 1 : 0);
}
