#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(path.join(ROOT, "db/migrations/0250_safety_training_records.sql"), "utf8");
const routes = fs.readFileSync(path.join(ROOT, "apps/backend/src/mdata/driver-training.routes.ts"), "utf8");
if (!migration.includes("training_records_tenant_scope")) {
  console.error("verify:driver-profile-training-records-rls FAIL: safety.training_records RLS policy missing");
  process.exit(1);
}
if (!routes.includes("safety.training_records")) {
  console.error("verify:driver-profile-training-records-rls FAIL: driver training routes must use safety.training_records");
  process.exit(1);
}
const createMembership = [
  "FROM mdata.driver_company_authorizations training_create_driver_dca",
  "training_create_driver_dca.driver_id = d.id",
  "training_create_driver_dca.company_id = $2::uuid",
  "training_create_driver_dca.is_authorized = true",
  "training_create_driver_dca.deactivated_at IS NULL",
  'if (row === null) return reply.code(404).send({ error: "mdata_driver_not_found" })',
];
function missingCreateMembership(source) {
  return createMembership.filter((token) => !source.includes(token));
}
for (const token of missingCreateMembership(routes)) {
    console.error(`verify:driver-profile-training-records-rls FAIL: training create missing ${token}`);
    process.exit(1);
}
if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const token of createMembership) {
    const mutated = routes.replace(token, "REMOVED");
    if (mutated !== routes && missingCreateMembership(mutated).includes(token)) caught++;
  }
  if (caught !== createMembership.length) {
    console.error(`verify:driver-profile-training-records-rls SELFTEST FAIL: ${caught}/${createMembership.length}`);
    process.exit(1);
  }
  console.log(`verify:driver-profile-training-records-rls SELFTEST PASS — ${caught}/${createMembership.length} mutations rejected`);
}
console.log("verify:driver-profile-training-records-rls PASS");
