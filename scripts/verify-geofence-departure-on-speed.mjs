#!/usr/bin/env node
/**
 * GAP-39 DEFECT A contributing cause (owner ruling, 2026-09-05, verbatim): "if the truck moves at
 * speed out of that area, then we're gonna assume if he didn't answer that, that he left."
 * Departure from `at`/`dwelling` must be gated on SUSTAINED SPEED (>=15 mph for >=3 consecutive
 * minutes) AND distance beyond the exit radius — distance alone must never fire it. Equal
 * enter/exit radii is what produced the boundary flap (3,127 false transitions on geofence
 * 188cf90c); hysteresis (arrive radius < depart radius) is mandatory and locked here too.
 *
 * Run: node scripts/verify-geofence-departure-on-speed.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

const STATES_REL = "apps/backend/src/integrations/samsara/geofences/state-machine/states.ts";
const ENGINE_REL = "apps/backend/src/integrations/samsara/geofences/state-machine/engine.ts";
const ENGINE_TEST_REL = "apps/backend/src/integrations/samsara/geofences/state-machine/__tests__/engine-vehicle-state.test.ts";

const states = read(STATES_REL);
if (states) {
  const arriveMatch = states.match(/DEFAULT_ARRIVE_RADIUS_M\s*=\s*(\d+)/);
  const departMatch = states.match(/DEFAULT_DEPART_RADIUS_M\s*=\s*(\d+)/);
  if (!arriveMatch || !departMatch) {
    failures.push(`${STATES_REL}: DEFAULT_ARRIVE_RADIUS_M / DEFAULT_DEPART_RADIUS_M constants missing`);
  } else if (Number(departMatch[1]) <= Number(arriveMatch[1])) {
    failures.push(`${STATES_REL}: hysteresis regression — DEFAULT_DEPART_RADIUS_M (${departMatch[1]}) must be strictly greater than DEFAULT_ARRIVE_RADIUS_M (${arriveMatch[1]})`);
  }
  if (!/DEPART_SPEED_MPH/.test(states)) {
    failures.push(`${STATES_REL}: DEPART_SPEED_MPH constant missing`);
  }
  if (!/DEPART_SUSTAINED_MIN/.test(states)) {
    failures.push(`${STATES_REL}: DEPART_SUSTAINED_MIN constant missing`);
  }

  // computeProposedState must never propose "departing" from distance alone — that edge belongs
  // to the speed gate in engine.ts. A direct "return \"departing\"" inside computeProposedState
  // would mean distance alone can fire it again.
  const fnMatch = states.match(/function computeProposedState\([\s\S]*?\n}/);
  if (fnMatch && /return\s+"departing"/.test(fnMatch[0])) {
    failures.push(`${STATES_REL}: computeProposedState must not return "departing" directly — distance alone must not trigger departure (owner ruling)`);
  }
}

const engine = read(ENGINE_REL);
if (engine) {
  if (!/hasSustainedDepartureSpeed/.test(engine)) {
    failures.push(`${ENGINE_REL}: hasSustainedDepartureSpeed() missing — departure speed gate regressed`);
  }
  if (!/speed_mph/.test(engine)) {
    failures.push(`${ENGINE_REL}: no speed_mph reference found — engine no longer reads live speed`);
  }
}

const engineTest = read(ENGINE_TEST_REL);
if (engineTest) {
  if (!/hasSustainedDepartureSpeed/.test(engineTest)) {
    failures.push(`${ENGINE_TEST_REL}: no test coverage for hasSustainedDepartureSpeed`);
  }
  if (!/sustained/i.test(engineTest)) {
    failures.push(`${ENGINE_TEST_REL}: no test asserting sustained-window behavior (a single fast ping must not qualify)`);
  }
}

if (failures.length) {
  console.error("verify-geofence-departure-on-speed FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-geofence-departure-on-speed OK — hysteresis holds (arrive < depart radius), departure is speed-gated not distance-only, sustained-speed tested");
