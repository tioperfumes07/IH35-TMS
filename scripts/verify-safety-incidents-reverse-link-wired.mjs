#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["reverse_link","connectivity"],"task":"WAVE-B-safety-incidents-reverse-link","leafRe":"^(incidents|accidents)"} */
// CLASS-WAVE B (reverse_link/connectivity) — Wave-B investigation (2026-08-12) found this family
// already fully built in code but never tagged in docs/specs/scoreboard/wire-sprint-built.json, so
// the module matrix showed it red despite the wiring being real. This is a REGRESSION guard for
// existing wiring, not new feature work.
//
// GET /api/v1/safety/incidents?driver_id=&unit_id=&trailer_id=&load_id= lets a driver, unit,
// trailer, or load profile page reverse-drill into every safety incident referencing it — explicitly
// commented at the trailer_id field's schema declaration: "SAF-F17: the trailer profile's reverse
// safety section."
//
// Static source check — no DB needed. Confirms the route + all four filter params exist; does not
// re-verify the SQL behind them (that is the job of the safety money-path guards already covering
// this file for their own concerns).
import fs from "node:fs";

const INCIDENTS_ROUTES = "apps/backend/src/safety/incidents.routes.ts";

function fail(msg) {
  console.error(`FAIL verify-safety-incidents-reverse-link-wired: ${msg}`);
  process.exitCode = 1;
}

const FILTERS = [
  ["driver_id", "filters.push(`i.driver_id = $${params.length}`)"],
  ["unit_id", "filters.push(`i.unit_id = $${params.length}`)"],
  ["trailer_id", "filters.push(`i.trailer_id = $${params.length}`)"],
  ["load_id", "filters.push(`i.load_id = $${params.length}`)"],
];

function check(src) {
  if (!src.includes('app.get("/api/v1/safety/incidents"')) {
    fail(`${INCIDENTS_ROUTES}: GET /api/v1/safety/incidents route not found.`);
    return;
  }
  for (const [name, needle] of FILTERS) {
    if (!src.includes(needle)) {
      fail(`${INCIDENTS_ROUTES}: ${name} query-param filter (reverse read into safety incidents) not found.`);
    }
  }
}

function selftest() {
  const original = fs.readFileSync(INCIDENTS_ROUTES, "utf8");
  let probesProven = 0;

  for (const [name, needle] of FILTERS) {
    const mutated = original.replace(needle, `// ${name} filter removed`);
    if (mutated === original) {
      console.error(`SELFTEST SETUP FAILED: ${name} filter pattern not found to mutate.`);
      process.exit(1);
    }
    check(mutated);
    const caught = process.exitCode === 1;
    process.exitCode = undefined;
    if (!caught) {
      console.error(`SELFTEST INERT: removing the ${name} filter was not caught.`);
      process.exit(1);
    }
    probesProven++;
  }

  console.log(`PASS verify-safety-incidents-reverse-link-wired --selftest (mutation probes proven non-inert: ${probesProven})`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  check(fs.readFileSync(INCIDENTS_ROUTES, "utf8"));
  if (process.exitCode !== 1) {
    console.log("PASS verify-safety-incidents-reverse-link-wired — driver/unit/trailer/load -> safety incidents reverse read (Wave-B reverse_link/connectivity) confirmed wired.");
  }
}
