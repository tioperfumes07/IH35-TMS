#!/usr/bin/env node
/**
 * ROUND 306 E-08 — GUARD (REDUNDANCY R-2: ONE geofence state path).
 * FAILS IF:
 *   1. the state machine (engine.ts transitionState) decides inside/outside from its own distance
 *      radii again instead of the canonical detector's geo.geofence_events;
 *   2. a transition is written without resolving load_id/stop_id (resolveTransitionLoadContext);
 *   3. processGpsBatch stops re-evaluating (fence, unit) pairs already out of idle (stale "at" forever);
 *   4. the canonical detector stops writing geo.geofence_events from polygon containment.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const SM = "apps/backend/src/integrations/samsara/geofences/state-machine";
const FILES = {
  engine: `${SM}/engine.ts`,
  transitions: `${SM}/transitions.service.ts`,
  detector: "apps/backend/src/telematics/geofence-detector.service.ts",
};
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

export function check(src) {
  const p = [];
  const e = stripComments(src.engine);
  const body = e.slice(e.indexOf("export async function transitionState("));
  if (!/computeProposedStateFromCanonical\(currentState, canonical\.rows\[0\]\?\.event_kind === "entered"/.test(body)) p.push("transitionState no longer proposes from the canonical geofence_events log.");
  if (/proposed = computeProposedState\(/.test(body) || /hasSustainedDepartureSpeed\(client/.test(body)) p.push("transitionState decides inside/outside from its own radii again.");
  if (!/FROM geo\.geofence_events ge/.test(body)) p.push("transitionState no longer reads geo.geofence_events.");
  if (!/resolveTransitionLoadContext\(client/.test(body) || !/loadContext\.load_id,\s*loadContext\.stop_id,\s*currentState/.test(body)) p.push("transitions no longer carry the resolved load_id/stop_id.");
  if (!/!openPairs\.has\(/.test(stripComments(src.transitions))) p.push("processGpsBatch no longer re-evaluates pairs already out of idle.");
  const d = stripComments(src.detector);
  if (!/pointInPolygon\(input\.latitude, input\.longitude/.test(d) || !/INSERT INTO geo\.geofence_events/.test(d)) p.push("the canonical detector no longer writes geo.geofence_events from polygon containment.");
  return p;
}

const load = () => Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, readFileSync(resolve(ROOT, f), "utf8")]));

function selftest() {
  const g = load();
  const mut = (k, a, b) => ({ ...g, [k]: g[k].split(a).join(b) });
  const cases = [
    [g, false],
    [mut("engine", 'computeProposedStateFromCanonical(currentState, canonical.rows[0]?.event_kind === "entered"', "computeProposedState(currentState, distanceM"), true],
    [mut("engine", "resolveTransitionLoadContext(client", "Promise.resolve({load_id:null,stop_id:null}) ?? x(client"), true],
    [mut("transitions", "!openPairs.has(", "!false && !x("), true],
    [mut("detector", "pointInPolygon(input.latitude, input.longitude", "near(input.latitude, input.longitude"), true],
  ];
  return cases.every(([s, f]) => (check(s).length > 0) === f);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-one-geofence-inside-decider selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const p = check(load());
  console.log(p.length ? `verify-one-geofence-inside-decider FAILED:\n  - ${p.join("\n  - ")}` : "verify-one-geofence-inside-decider: OK -- one inside/outside decider (polygon detector), state machine reads it, transitions carry load/stop, stale states re-evaluated.");
  process.exit(p.length ? 1 : 0);
}
