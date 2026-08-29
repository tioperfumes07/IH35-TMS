#!/usr/bin/env node
import fs from "node:fs";

const path = "apps/backend/src/telematics/auto-status.service.ts";
if (!fs.existsSync(path)) throw new Error(`Missing file: ${path}`);
const content = fs.readFileSync(path, "utf8");
const responsePath = "apps/backend/src/driver/status-suggestions.routes.ts";
if (!fs.existsSync(responsePath)) throw new Error(`Missing file: ${responsePath}`);
const responses = fs.readFileSync(responsePath, "utf8");

if (/UPDATE\s+mdata\.loads\s+SET\s+status/i.test(content)) {
  throw new Error("Auto status service must never write mdata.loads.status directly.");
}
if (!content.includes("INSERT INTO dispatch.auto_status_suggestions")) {
  throw new Error("Auto status service must insert suggestions.");
}

function responseFailures(source) {
  const failures = [];
  if (!source.includes("pg_advisory_xact_lock(hashtextextended($1, 0))")) failures.push("serialized response lifecycle");
  if (!/EXISTS \([\s\S]{0,180}FROM dispatch\.auto_status_suggestion_responses r[\s\S]{0,180}r\.suggestion_id = s\.id[\s\S]{0,140}r\.operating_company_id = s\.operating_company_id/.test(source)) failures.push("same-company prior response check");
  if (!source.includes("if (suggestion.rows[0].already_responded) return true")) failures.push("idempotent response replay");
  return failures;
}

const failures = responseFailures(responses);
if (failures.length) throw new Error(`Auto status response lifecycle incomplete: ${failures.join(", ")}`);

if (process.argv.includes("--selftest")) {
  const mutations = [
    responses.replace("pg_advisory_xact_lock(hashtextextended($1, 0))", "no_lock"),
    responses.replace("r.operating_company_id = s.operating_company_id", "TRUE"),
    responses.replace("if (suggestion.rows[0].already_responded) return true", ""),
  ];
  for (const mutation of mutations) {
    if (responseFailures(mutation).length === 0) throw new Error("Auto status response mutation survived");
  }
  console.log(`verify-auto-status-no-direct-status-write selftest: ${mutations.length}/${mutations.length} caught`);
}

console.log("verify-auto-status-no-direct-status-write: ok");
