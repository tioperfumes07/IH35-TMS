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
console.log("verify:driver-profile-training-records-rls PASS");
