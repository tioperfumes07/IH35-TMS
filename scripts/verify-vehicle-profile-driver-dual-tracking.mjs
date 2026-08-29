#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(path.join(ROOT, "db/migrations/0295_vehicle_profile_part1.sql"), "utf8");
const routes = fs.readFileSync(path.join(ROOT, "apps/backend/src/mdata/unit-default-driver.routes.ts"), "utf8");
const aggregate = fs.readFileSync(path.join(ROOT, "apps/backend/src/mdata/unit-aggregate.service.ts"), "utf8");
const driverSection = fs.readFileSync(path.join(ROOT, "apps/frontend/src/components/vehicle-profile/DriverAssignmentSection.tsx"), "utf8");

if (!migration.includes("is_default") || !migration.includes("telematics.vehicle_driver_assignments")) {
  console.error("verify:vehicle-profile-driver-dual-tracking FAIL: missing is_default on telematics.vehicle_driver_assignments");
  process.exit(1);
}
if (!migration.includes("uq_vda_one_default_per_unit")) {
  console.error("verify:vehicle-profile-driver-dual-tracking FAIL: missing default unique index");
  process.exit(1);
}
for (const endpoint of ["/drivers/assignments", "/drivers/default", "/drivers/clear-default", "/current-driver"]) {
  if (!routes.includes(endpoint)) {
    console.error(`verify:vehicle-profile-driver-dual-tracking FAIL: missing endpoint ${endpoint}`);
    process.exit(1);
  }
}
if (!aggregate.includes("default_driver") || !aggregate.includes("current_driver") || !aggregate.includes("samsara_webhook")) {
  console.error("verify:vehicle-profile-driver-dual-tracking FAIL: aggregate must read default + current from telematics");
  process.exit(1);
}
if (!driverSection.includes("defaultDriver") || !driverSection.includes("currentDriver")) {
  console.error("verify:vehicle-profile-driver-dual-tracking FAIL: frontend must render default + current separately");
  process.exit(1);
}
// RE-ANCHOR (found stale 2026-08-29): "default_dca" is also a literal substring of the unrelated
// "set_default_dca" alias (POST /drivers/default's own authorization check, lines ~54-57) with an
// IDENTICAL company_id/is_authorized/deactivated_at chain shape. Check #0's un-anchored regex could
// match entirely within that unrelated block, so mutating the REAL target (bare `default_dca`,
// lines ~89-90) went undetected -- the check found the OTHER block's identical pattern instead.
// Negative lookbehinds exclude the `set_` prefix from every default_dca reference.
const routeChecks = (candidate) => [
  /(?<!set_)default_dca\.company_id = \$2::uuid[\s\S]{0,160}(?<!set_)default_dca\.is_authorized = true[\s\S]{0,160}(?<!set_)default_dca\.deactivated_at IS NULL/.test(
    candidate,
  ),
  /current_dca\.company_id = \$2::uuid[\s\S]{0,160}current_dca\.is_authorized = true[\s\S]{0,160}current_dca\.deactivated_at IS NULL/.test(candidate),
  /history_dca\.company_id = \$2::uuid[\s\S]{0,160}history_dca\.is_authorized = true[\s\S]{0,160}history_dca\.deactivated_at IS NULL/.test(candidate),
  (candidate.match(/rateLimit: \{ max: 120, timeWindow: "1 minute" \}/g) ?? []).length === 2,
];
const aggregateChecks = (candidate) => [
  /aggregate_default_dca\.company_id = vda\.operating_company_id[\s\S]{0,180}aggregate_default_dca\.is_authorized = true/.test(candidate),
  /aggregate_current_dca\.company_id = vda\.operating_company_id[\s\S]{0,180}aggregate_current_dca\.is_authorized = true/.test(candidate),
  /photo_dca\.company_id = p\.operating_company_id[\s\S]{0,180}photo_dca\.is_authorized = true/.test(candidate),
];
if (routeChecks(routes).some((ok) => !ok)) {
  console.error("verify:vehicle-profile-driver-dual-tracking FAIL: default/current/history driver reads must preserve authorized labels and rate limits");
  process.exit(1);
}
if (aggregateChecks(aggregate).some((ok) => !ok)) {
  console.error("verify:vehicle-profile-driver-dual-tracking FAIL: aggregate default/current/photo driver labels must preserve active authorization");
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  // RE-ANCHOR (found stale 2026-08-29): "default_dca.is_authorized = true" is also a literal
  // SUBSTRING of "set_default_dca.is_authorized = true" (an unrelated alias, line ~56) which sorts
  // earlier in the file. A bare .replace() (non-global) mutated that unrelated embedded occurrence
  // instead of the real check target (the bare `default_dca` alias, line ~90), leaving the actual
  // pattern intact and the mutation escaped. Anchored on a negative lookbehind so only the bare
  // `default_dca` alias (not `set_default_dca`) matches.
  const routeMutations = [
    (x) => x.replace(/(?<!set_)default_dca\.is_authorized = true/, "TRUE"),
    (x) => x.replace("current_dca.is_authorized = true", "TRUE"),
    (x) => x.replace("history_dca.is_authorized = true", "TRUE"),
    (x) => x.replace('rateLimit: { max: 120, timeWindow: "1 minute" }', 'rateLimit: { max: 0, timeWindow: "1 minute" }'),
  ];
  for (const mutate of routeMutations) {
    const broken = mutate(routes);
    if (broken === routes || routeChecks(broken).every(Boolean)) {
      console.error("verify:vehicle-profile-driver-dual-tracking SELFTEST FAIL: planted defect escaped");
      process.exit(1);
    }
  }
  const aggregateMutations = [
    (x) => x.replace("aggregate_default_dca.is_authorized = true", "TRUE"),
    (x) => x.replace("aggregate_current_dca.is_authorized = true", "TRUE"),
    (x) => x.replace("photo_dca.is_authorized = true", "TRUE"),
  ];
  for (const mutate of aggregateMutations) {
    const broken = mutate(aggregate);
    if (broken === aggregate || aggregateChecks(broken).every(Boolean)) {
      console.error("verify:vehicle-profile-driver-dual-tracking SELFTEST FAIL: planted aggregate defect escaped");
      process.exit(1);
    }
  }
  console.log("verify:vehicle-profile-driver-dual-tracking SELFTEST PASS — 7 planted defects caught");
  process.exit(0);
}
console.log("verify:vehicle-profile-driver-dual-tracking PASS");
