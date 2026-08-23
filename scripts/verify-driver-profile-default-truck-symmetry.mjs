#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const unitRoutes = fs.readFileSync(path.join(ROOT, "apps/backend/src/mdata/unit-default-driver.routes.ts"), "utf8");
const driverRoutes = fs.readFileSync(path.join(ROOT, "apps/backend/src/mdata/driver-default-truck.routes.ts"), "utf8");
const aggregate = fs.readFileSync(path.join(ROOT, "apps/backend/src/mdata/driver-aggregate.service.ts"), "utf8");

function verifyCurrentLoadReverse(source) {
  const failures = [];
  if (!/WHERE \(l\.assigned_primary_driver_id = \$1::uuid OR l\.assigned_secondary_driver_id = \$1::uuid\)/.test(source)) {
    failures.push("driver current-load reverse must include both primary and secondary driver assignments");
  }
  if (!/AND l\.operating_company_id = \$2::uuid[\s\S]{0,120}AND l\.soft_deleted_at IS NULL/.test(source)) {
    failures.push("driver current-load reverse must remain company-scoped and exclude soft-deleted loads");
  }
  if (!/AND l\.status::text NOT IN \('delivered', 'cancelled', 'void', 'completed', 'closed'\)/.test(source)) {
    failures.push("driver current-load reverse must exclude every terminal load status");
  }
  return failures;
}

for (const endpoint of ["/default-truck", "/clear-default-truck", "truck-assignments"]) {
  if (!driverRoutes.includes(endpoint)) {
    console.error(`verify:driver-profile-default-truck-symmetry FAIL: missing ${endpoint}`);
    process.exit(1);
  }
}
for (const endpoint of ["/drivers/default", "/drivers/clear-default", "/drivers/assignments"]) {
  if (!unitRoutes.includes(endpoint)) {
    console.error(`verify:driver-profile-default-truck-symmetry FAIL: unit mirror missing ${endpoint}`);
    process.exit(1);
  }
}
if (!aggregate.includes("is_default") || !aggregate.includes("samsara_webhook")) {
  console.error("verify:driver-profile-default-truck-symmetry FAIL: aggregate must read default + samsara assignments");
  process.exit(1);
}
if (!driverRoutes.includes("is_default = true") || !unitRoutes.includes("is_default = true")) {
  console.error("verify:driver-profile-default-truck-symmetry FAIL: both routes must set is_default");
  process.exit(1);
}
const currentLoadFailures = verifyCurrentLoadReverse(aggregate);
if (currentLoadFailures.length > 0) {
  console.error(`verify:driver-profile-default-truck-symmetry FAIL: ${currentLoadFailures.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    aggregate.replace(" OR l.assigned_secondary_driver_id = $1::uuid", ""),
    aggregate.replace("AND l.operating_company_id = $2::uuid", "AND TRUE"),
    aggregate.replace("AND l.soft_deleted_at IS NULL", "AND TRUE"),
    aggregate.replace("'delivered', 'cancelled', 'void', 'completed', 'closed'", "'delivered', 'cancelled', 'void', 'completed'"),
  ];
  const escaped = mutations.filter((source) => verifyCurrentLoadReverse(source).length === 0);
  if (escaped.length > 0) {
    console.error(`verify:driver-profile-default-truck-symmetry SELFTEST FAIL: ${escaped.length}/${mutations.length} planted defects escaped`);
    process.exit(1);
  }
  console.log(`verify:driver-profile-default-truck-symmetry SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
}
console.log("verify:driver-profile-default-truck-symmetry PASS");
