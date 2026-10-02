#!/usr/bin/env node
import fs from "node:fs";
import { setsTenantGuc, TENANT_GUC_HINT } from "./lib/tenant-guc-match.mjs";
import { PATHS, checkFenceStampContract } from "./lib/one-arrival-detector.mjs";

function mustInclude(content, needle, description) {
  if (!content.includes(needle)) {
    throw new Error(`Missing ${description}: ${needle}`);
  }
}

// Re-anchored 2026-10-02 (CC-3 queue 6 — ONE arrival detector): the arrival writer is the geofence detector's stop stamp.
const detector = fs.readFileSync(PATHS.detector, "utf8");
const stampProblems = checkFenceStampContract(detector);
if (stampProblems.length) throw new Error(stampProblems.join("\n"));

const routesPath = "apps/backend/src/driver/arrival-prompts.routes.ts";
if (!fs.existsSync(routesPath)) {
  throw new Error(`Missing arrival prompt routes: ${routesPath}`);
}
const routes = fs.readFileSync(routesPath, "utf8");
// CLS-GUARD-LITERAL-GUC: assert the PROPERTY (this file sets the tenant GUC), not one exact
// call. setScopedCompanyContext sets the same GUC AND asserts company membership first —
// strictly stronger — so a literal grep failed a route for being made safer.
if (!setsTenantGuc(routes)) {
  throw new Error(`Missing driver prompt tenant context — ${TENANT_GUC_HINT}`);
}
mustInclude(routes, "a.operating_company_id = $1::uuid", "driver prompt query tenant filter");
mustInclude(routes, "dispatch.stop_arrival_dismissed", "durable arrival dismissal event");
mustInclude(routes, "pg_advisory_xact_lock", "serialized arrival dismissal lifecycle");
mustInclude(routes, "already_dismissed", "idempotent arrival dismissal replay");
mustInclude(routes, "AND a.driver_id = $3::uuid", "dismiss prompt driver ownership predicate");
// Confirm AND dismiss both serialize by prompt id under the caller's own driver_id.
const ownsBoth = (src) => src.split("AND a.driver_id = $3::uuid").length - 1 >= 2;
if (!ownsBoth(routes)) throw new Error("Both confirm and dismiss must carry the driver ownership predicate (AND a.driver_id = $3::uuid)");
mustInclude(routes, "AND a.confirmed_at IS NULL", "dismiss prompt pending lifecycle predicate");
mustInclude(routes, "if (!dismissed) return reply.code(404)", "honest missing-prompt dismissal response");
mustInclude(routes, "FROM mdata.loads l", "confirm stop canonical load join");
mustInclude(routes, "AND l.operating_company_id = $3::uuid", "confirm stop immutable company predicate");
mustInclude(routes, "RETURNING s.id::text AS id", "confirm stop write evidence");
mustInclude(routes, 'if (!arrivalStop.rows[0]?.id) throw new Error("arrival_stop_not_found")', "confirm stop lost-write rejection");
mustInclude(routes, 'reply.code(409).send({ error: "arrival_stop_not_found" })', "honest confirm integrity response");
if ((routes.match(/dismissed\.payload->>'resource_id'/g) ?? []).length < 1) {
  throw new Error("Arrival prompt list must consume durable dismissal evidence");
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["drop ownership", routes.replace("AND a.driver_id = $3::uuid", "")], // one of the two (confirm + dismiss) is enough to fail
    ["drop pending lifecycle", routes.replaceAll("AND a.confirmed_at IS NULL", "")],
    ["drop durable list exclusion", routes.replace("dismissed.payload->>'resource_id'", "dismissed.payload->>'missing_id'")],
    ["restore false success", routes.replace("if (!dismissed) return reply.code(404)", "if (!dismissed) return { ok: true }")],
    ["drop confirm load join", routes.replace("FROM mdata.loads l", "")],
    ["drop confirm company", routes.replace("AND l.operating_company_id = $3::uuid", "")],
    ["drop confirm write evidence", routes.replace("RETURNING s.id::text AS id", "")],
    ["drop confirm lost-write check", routes.replace('if (!arrivalStop.rows[0]?.id) throw new Error("arrival_stop_not_found")', "")],
    ["hide confirm integrity error", routes.replace('reply.code(409).send({ error: "arrival_stop_not_found" })', "reply.code(200).send({ ok: true })")],
  ];
  for (const [name, mutated] of [
    ["drop fence tenant", detector.replace("g.operating_company_id = $2::uuid", "true")],
    ["overwrite evidence", detector.replace("AND ls.actual_arrival_at IS NULL", "")],
  ]) {
    if (checkFenceStampContract(mutated).length === 0) throw new Error(`Selftest mutation survived: ${name}`);
  }
  for (const [name, mutated] of mutations) {
    let caught = false;
    try {
      mustInclude(mutated, "AND a.driver_id = $3::uuid", "dismiss prompt driver ownership predicate");
      if (!ownsBoth(mutated)) throw new Error("ownership dropped on one path");
      mustInclude(mutated, "AND a.confirmed_at IS NULL", "dismiss prompt pending lifecycle predicate");
      mustInclude(mutated, "dismissed.payload->>'resource_id'", "durable list exclusion");
      mustInclude(mutated, "if (!dismissed) return reply.code(404)", "honest false-success rejection");
      mustInclude(mutated, "FROM mdata.loads l", "confirm stop canonical load join");
      mustInclude(mutated, "AND l.operating_company_id = $3::uuid", "confirm stop immutable company predicate");
      mustInclude(mutated, "RETURNING s.id::text AS id", "confirm stop write evidence");
      mustInclude(mutated, 'if (!arrivalStop.rows[0]?.id) throw new Error("arrival_stop_not_found")', "confirm stop lost-write rejection");
      mustInclude(mutated, 'reply.code(409).send({ error: "arrival_stop_not_found" })', "honest confirm integrity response");
    } catch {
      caught = true;
    }
    if (!caught) throw new Error(`Selftest mutation survived: ${name}`);
  }
  console.log(`verify-arrival-detection-tenant-scope selftest: ${mutations.length}/${mutations.length} caught`);
}

console.log("verify-arrival-detection-tenant-scope: ok");
