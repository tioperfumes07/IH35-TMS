#!/usr/bin/env node
/** @matrix-built {"modules":["customers","insurance","reports"],"cols":["reverse_link","connectivity"],"task":"WAVE-B-customer-reverse-link","leafRe":"^(detail\\.(contracts|coi)|md\\.coi_requests|claims\\.|lawsuits\\.|report\\.(customer_profitability|lane_profitability|trip_profitability))"} */
// CLASS-WAVE B (reverse_link/connectivity) — Wave-B investigation (2026-08-12) found these three
// reverse-link families already fully built in code but never tagged in
// docs/specs/scoreboard/wire-sprint-built.json, so the module matrix showed them red despite the
// wiring being real. This is a REGRESSION guard for existing wiring, not new feature work.
//
// Family 1 — customer -> contracts reverse read: GET .../customer-contracts?customer_id=... lets a
// customer profile drill into every contract on file (apps/backend/src/customer-contracts/customer-contract.routes.ts).
// Family 2 — customer -> certificate-of-insurance requests reverse read:
// GET /api/v1/insurance/coi-requests?customer_id=... (apps/backend/src/insurance/coi.service.ts).
// Family 3 — customer -> lane profitability filter: profitability.routes.ts's report endpoints accept
// a customer_id filter so a customer's own lane profitability can be isolated
// (apps/backend/src/profitability/profitability.routes.ts).
//
// Static source check — no DB needed. Confirms the filter/predicate exists in each file; does not
// re-verify the SQL's correctness beyond that (each file has its own money-path/RLS guards for that).
import fs from "node:fs";

const CONTRACT_ROUTES = "apps/backend/src/customer-contracts/customer-contract.routes.ts";
const COI_SERVICE = "apps/backend/src/insurance/coi.service.ts";
const PROFITABILITY_ROUTES = "apps/backend/src/profitability/profitability.routes.ts";

function fail(msg) {
  console.error(`FAIL verify-customer-reverse-link-wired: ${msg}`);
  process.exitCode = 1;
}

function checkContracts(src) {
  if (!src.includes("WHERE c.customer_id = $1")) {
    fail(`${CONTRACT_ROUTES}: customer_id filter (customer -> contracts reverse read) not found.`);
  }
}

function checkCoi(src) {
  if (!src.includes("clauses.push(`r.customer_id = $${values.length}::uuid`)")) {
    fail(`${COI_SERVICE}: customer_id filter (customer -> COI requests reverse read) not found.`);
  }
}

function checkProfitability(src) {
  // The identical filter line appears in TWO separate query builders in this file (two report
  // endpoints) — count occurrences, not just presence, or breaking one of the two silently passes.
  const needle = "if (f.customer_id) { where += ` AND customer_id = $${idx++}`; params.push(f.customer_id); }";
  const count = src.split(needle).length - 1;
  if (count < 2) {
    fail(`${PROFITABILITY_ROUTES}: customer_id filter (customer-scoped lane profitability) found in only ${count}/2 report query builders.`);
  }
}

function selftest() {
  const cases = [
    [CONTRACT_ROUTES, checkContracts, "WHERE c.customer_id = $1", "WHERE 1=1 /* customer_id filter removed */"],
    [COI_SERVICE, checkCoi, "clauses.push(`r.customer_id = $${values.length}::uuid`)", "// customer_id filter removed"],
    [
      PROFITABILITY_ROUTES,
      checkProfitability,
      "if (f.customer_id) { where += ` AND customer_id = $${idx++}`; params.push(f.customer_id); }",
      "// customer_id filter removed",
    ],
  ];
  let probesProven = 0;
  for (const [file, checker, needle, replacement] of cases) {
    const original = fs.readFileSync(file, "utf8");
    // replaceAll — profitability.routes.ts repeats the identical customer_id-filter line twice
    // (two separate query builders); a single .replace() only killed the first, leaving the
    // second still satisfying the check's .includes() and making the probe silently inert.
    const mutated = original.split(needle).join(replacement);
    if (mutated === original) {
      console.error(`SELFTEST SETUP FAILED: pattern not found to mutate in ${file}.`);
      process.exit(1);
    }
    checker(mutated);
    const caught = process.exitCode === 1;
    process.exitCode = undefined;
    if (!caught) {
      console.error(`SELFTEST INERT: removing the customer_id filter in ${file} was not caught.`);
      process.exit(1);
    }
    probesProven++;
  }
  console.log(`PASS verify-customer-reverse-link-wired --selftest (mutation probes proven non-inert: ${probesProven})`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  checkContracts(fs.readFileSync(CONTRACT_ROUTES, "utf8"));
  checkCoi(fs.readFileSync(COI_SERVICE, "utf8"));
  checkProfitability(fs.readFileSync(PROFITABILITY_ROUTES, "utf8"));
  if (process.exitCode !== 1) {
    console.log("PASS verify-customer-reverse-link-wired — customer -> contracts/COI-requests/lane-profitability reverse reads (Wave-B reverse_link/connectivity) confirmed wired.");
  }
}
