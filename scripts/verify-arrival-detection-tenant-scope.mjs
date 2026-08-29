#!/usr/bin/env node
import fs from "node:fs";
import { setsTenantGuc, TENANT_GUC_HINT } from "./lib/tenant-guc-match.mjs";

function mustInclude(content, needle, description) {
  if (!content.includes(needle)) {
    throw new Error(`Missing ${description}: ${needle}`);
  }
}

const servicePath = "apps/backend/src/telematics/arrival-detection.service.ts";
if (!fs.existsSync(servicePath)) {
  throw new Error(`Missing arrival detection service: ${servicePath}`);
}
const service = fs.readFileSync(servicePath, "utf8");
mustInclude(service, "l.operating_company_id = $1::uuid", "load tenant filter");
mustInclude(service, "WHERE operating_company_id = $1::uuid", "arrival tenant filter");
mustInclude(service, "operating_company_id,", "arrival write tenant column");

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
    ["drop ownership", routes.replace("AND a.driver_id = $3::uuid", "")],
    ["drop pending lifecycle", routes.replaceAll("AND a.confirmed_at IS NULL", "")],
    ["drop durable list exclusion", routes.replace("dismissed.payload->>'resource_id'", "dismissed.payload->>'missing_id'")],
    ["restore false success", routes.replace("if (!dismissed) return reply.code(404)", "if (!dismissed) return { ok: true }")],
    ["drop confirm load join", routes.replace("FROM mdata.loads l", "")],
    ["drop confirm company", routes.replace("AND l.operating_company_id = $3::uuid", "")],
    ["drop confirm write evidence", routes.replace("RETURNING s.id::text AS id", "")],
    ["drop confirm lost-write check", routes.replace('if (!arrivalStop.rows[0]?.id) throw new Error("arrival_stop_not_found")', "")],
    ["hide confirm integrity error", routes.replace('reply.code(409).send({ error: "arrival_stop_not_found" })', "reply.code(200).send({ ok: true })")],
  ];
  for (const [name, mutated] of mutations) {
    let caught = false;
    try {
      mustInclude(mutated, "AND a.driver_id = $3::uuid", "dismiss prompt driver ownership predicate");
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
