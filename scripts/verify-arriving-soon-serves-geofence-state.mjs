#!/usr/bin/env node
/**
 * ROUND 301 T-34 — GUARD.
 *
 * Owner killed the separate "Arriving Soon" tab; the feed moves to Maintenance Home. Backend's
 * job: "Serve the feed: units inbound, ETA, geofence state, what is due on arrival." The route
 * already served units-inbound/ETA/what's-due before this item; geofence state was the gap.
 *
 * FAILS IF:
 *   1. the route no longer joins geo.geofence_vehicle_state (the real geofence-state source).
 *   2. the response mapping no longer exposes geofence_state to the caller.
 *   3. a null geofence state (never approached a tracked geofence) is defaulted/guessed to a
 *      string instead of returned honestly as null.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const ROUTE_FILE = resolve(ROOT, "apps/backend/src/maintenance/arriving-soon.routes.ts");

export function checkJoinsGeofenceVehicleState(source) {
  const problems = [];
  if (!/geo\.geofence_vehicle_state/.test(source)) {
    problems.push("arriving-soon.routes.ts does not reference geo.geofence_vehicle_state -- geofence state must come from the real per-unit state table, not be invented or left out.");
  }
  return problems;
}

export function checkExposesGeofenceState(source) {
  const problems = [];
  if (!/geofence_state\s*:/.test(source)) {
    problems.push("arriving-soon.routes.ts's card mapping does not expose a geofence_state field to the caller.");
  }
  return problems;
}

export function checkNullNeverGuessed(source) {
  const problems = [];
  const fieldMatch = source.match(/geofence_state:\s*[^,\n]+/);
  if (!fieldMatch) {
    problems.push("could not find the geofence_state field assignment to check.");
    return problems;
  }
  const assignment = fieldMatch[0];
  // Acceptable: `row.geofence_state ?? null` (or similar honest pass-through-or-null). Reject a
  // hardcoded fallback STRING (e.g. `?? "unknown"` or `?? "no_signal"`), which would silently
  // manufacture a state where none is known.
  if (/\?\?\s*["'`]/.test(assignment)) {
    problems.push(`geofence_state's null case falls back to a guessed string literal (${assignment}) -- a unit with no tracked geofence state must return null, never a manufactured label.`);
  }
  return problems;
}

export function run() {
  let source;
  try {
    source = readFileSync(ROUTE_FILE, "utf8");
  } catch {
    return { ok: false, message: `${ROUTE_FILE.replace(ROOT + "/", "")} does not exist.` };
  }
  const problems = [
    ...checkJoinsGeofenceVehicleState(source),
    ...checkExposesGeofenceState(source),
    ...checkNullNeverGuessed(source),
  ];
  return {
    ok: problems.length === 0,
    message:
      problems.length === 0
        ? "verify-arriving-soon-serves-geofence-state: OK -- geofence state joined from the real table, exposed, never guessed."
        : `verify-arriving-soon-serves-geofence-state FAILED:\n  - ${problems.join("\n  - ")}`,
  };
}

function selftest() {
  let ok = true;
  const expect = (name, problems, wantFail) => {
    const failed = problems.length > 0;
    if (failed !== wantFail) {
      console.error(`SELFTEST FAIL: ${name} expected ${wantFail ? "a failure" : "no failure"}, got ${JSON.stringify(problems)}`);
      ok = false;
    }
  };

  expect("joins the real table", checkJoinsGeofenceVehicleState("LEFT JOIN LATERAL (SELECT * FROM geo.geofence_vehicle_state g WHERE ...) gvs ON true"), false);
  expect("no geofence join at all", checkJoinsGeofenceVehicleState("SELECT * FROM maintenance.v_arriving_soon"), true);

  expect("exposes the field", checkExposesGeofenceState("geofence_state: row.geofence_state ?? null,"), false);
  expect("field missing", checkExposesGeofenceState("unit_number: row.unit_number,"), true);

  expect("honest null pass-through", checkNullNeverGuessed("geofence_state: row.geofence_state ?? null,\n"), false);
  expect("guessed string fallback", checkNullNeverGuessed('geofence_state: row.geofence_state ?? "unknown",\n'), true);

  return ok;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const passed = selftest();
    console.log(passed ? "verify-arriving-soon-serves-geofence-state selftest PASS" : "verify-arriving-soon-serves-geofence-state selftest FAIL");
    process.exit(passed ? 0 : 1);
  }
  const { ok, message } = run();
  console.log(message);
  process.exit(ok ? 0 : 1);
}
