#!/usr/bin/env node
import fs from "node:fs";

const migration = fs.readFileSync(new URL("../db/migrations/202608270001_safety_da_active_enrollment_unique.sql", import.meta.url), "utf8");
const service = fs.readFileSync(new URL("../apps/backend/src/safety/drug-alcohol/program.service.ts", import.meta.url), "utf8");
const pool = fs.readFileSync(new URL("../apps/backend/src/safety/drug-alcohol/random-pool.service.ts", import.meta.url), "utf8");
const routes = fs.readFileSync(new URL("../apps/backend/src/safety/drug-alcohol/routes.ts", import.meta.url), "utf8");

function verify(parts) {
  const failures = [];
  const enrollDriver = parts.service.slice(parts.service.indexOf("export async function enrollDriver"), parts.service.indexOf("export async function listEnrollments"));
  if (!/row_number\(\) OVER[^]*?PARTITION BY operating_company_id, driver_uuid[^]*?SET is_active = false[^]*?active_rank > 1/m.test(parts.migration)) failures.push("migration must preserve one newest active enrollment and deactivate duplicate history");
  if (!/CREATE UNIQUE INDEX[^]*?\(operating_company_id, driver_uuid\)\s+WHERE is_active = true/m.test(parts.migration)) failures.push("database must enforce one active company-driver enrollment");
  if (!/SELECT d\.id::text[^]*?driver_company_authorizations[^]*?active_driver_not_in_operating_company/m.test(enrollDriver)) failures.push("single enrollment must validate a scoped active canonical driver");
  if (!/ON CONFLICT \(operating_company_id, driver_uuid\) WHERE is_active = true\s+DO NOTHING[^]*?active_enrollment_exists/m.test(enrollDriver)) failures.push("single enrollment must use the partial unique arbiter and report duplicates");
  if (!/ON CONFLICT \(operating_company_id, driver_uuid\) WHERE is_active = true\s+DO NOTHING\s+RETURNING driver_uuid::text/m.test(parts.pool)) failures.push("bulk enrollment must be concurrency-safe through the same unique arbiter");
  if (!/active_enrollment_exists[^]*?reply\.code\(409\)/m.test(parts.routes)) failures.push("duplicate single enrollment must return HTTP 409 rather than 500");
  return failures;
}

const parts = { migration, service, pool, routes };
const failures = verify(parts);
if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...parts, migration: migration.replace("active_rank > 1", "active_rank > 0") },
    { ...parts, migration: migration.replace("CREATE UNIQUE INDEX", "CREATE INDEX") },
    { ...parts, service: service.slice(0, service.indexOf("export async function enrollDriver")) + service.slice(service.indexOf("export async function enrollDriver")).replace("driver_company_authorizations", "driver_authorizations_removed") },
    { ...parts, service: service.replace("DO NOTHING", "DO UPDATE SET is_active = true") },
    { ...parts, pool: pool.replace("DO NOTHING", "DO UPDATE SET is_active = true") },
    { ...parts, routes: routes.replace('return reply.code(409).send({ error: "active_enrollment_exists" });', 'return reply.code(500).send({ error: "active_enrollment_exists" });') },
  ];
  const escaped = mutations.map((mutation, index) => ({ mutation, index })).filter(({ mutation }) => verify(mutation).length === 0);
  if (escaped.length) {
    console.error(`FAIL DA active enrollment uniqueness selftest: mutation(s) ${escaped.map(({ index }) => index + 1).join(", ")} escaped`);
    process.exit(1);
  }
  console.log(`PASS DA active enrollment uniqueness selftest (${mutations.length} mutations rejected)`);
  process.exit(0);
}
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL ${failure}`));
  process.exit(1);
}
console.log("PASS DA enrollment is scoped and unique under single/bulk concurrency");
