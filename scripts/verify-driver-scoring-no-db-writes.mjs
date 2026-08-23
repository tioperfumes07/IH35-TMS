#!/usr/bin/env node
import fs from "node:fs";

const target = "apps/backend/src/safety/driver-scoring.service.ts";
const route = "apps/backend/src/safety/driver-scoring.routes.ts";
const src = fs.readFileSync(target, "utf8").toLowerCase();
const routeSrc = fs.readFileSync(route, "utf8");
const forbidden = ["insert ", "update ", "delete ", "create table", "alter table"];
const checks = (candidate) => [
  ...forbidden.filter((token) => src.includes(token)).map((token) => `service contains forbidden write token: ${token}`),
  ...((candidate.match(/event_dca\.is_authorized = true/g) ?? []).length === 2 ? [] : ["both score windows must include authorized shared drivers"]),
  ...(/roster_dca\.company_id = \$1::uuid[\s\S]{0,180}roster_dca\.is_authorized = true[\s\S]{0,180}roster_dca\.deactivated_at IS NULL/.test(candidate) ? [] : ["leaderboard roster suppresses authorized shared drivers"]),
  ...(/dca\.company_id = \$2::uuid[\s\S]{0,180}dca\.is_authorized = true[\s\S]{0,180}dca\.deactivated_at IS NULL/.test(candidate) ? [] : ["exact-driver events do not validate the parent"]),
  ...(/label_dca\.company_id = e\.operating_company_id[\s\S]{0,180}label_dca\.is_authorized = true/.test(candidate) ? [] : ["shared-driver events are suppressed"]),
  ...(/if \(!result\.found\) return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(candidate) ? [] : ["invalid exact driver returns a false empty"]),
  ...((candidate.match(/rateLimit: \{ max: 60, timeWindow: "1 minute" \}/g) ?? []).length === 2 ? [] : ["driver-scoring reads are not both rate limited"]),
];

const found = checks(routeSrc);
if (found.length > 0) {
  console.error("verify-driver-scoring-no-db-writes failed");
  for (const failure of found) console.error(`  ${failure}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    (x) => x.replace("event_dca.is_authorized = true", "TRUE"),
    (x) => x.replace("roster_dca.is_authorized = true", "TRUE"),
    (x) => x.replace("dca.is_authorized = true", "TRUE"),
    (x) => x.replace("label_dca.is_authorized = true", "TRUE"),
    (x) => x.replace("if (!result.found) return reply.code(404)", "if (false) return reply.code(404)"),
    (x) => x.replace('rateLimit: { max: 60, timeWindow: "1 minute" }', 'rateLimit: { max: 0, timeWindow: "1 minute" }'),
  ];
  for (const mutate of mutations) {
    const broken = mutate(routeSrc);
    if (broken === routeSrc || checks(broken).length === 0) {
      console.error("verify-driver-scoring-no-db-writes --selftest failed: planted defect escaped");
      process.exit(1);
    }
  }
  console.log(`verify-driver-scoring-no-db-writes --selftest: ok — ${mutations.length} planted defects caught`);
  process.exit(0);
}

console.log("verify-driver-scoring-no-db-writes: ok — read-only scoring preserves authorized shared-driver reverse scope and honest parent semantics");
