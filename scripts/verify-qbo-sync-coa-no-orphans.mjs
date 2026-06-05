#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const migrationPath = path.join(ROOT, "db/migrations/0375_qbo_chart_of_accounts_sync_metadata.sql");
const pullerPath = path.join(ROOT, "apps/backend/src/qbo-sync/chart-of-accounts-puller.ts");
const reconcilerPath = path.join(ROOT, "apps/backend/src/qbo-sync/chart-of-accounts-reconciler.ts");
const routesPath = path.join(ROOT, "apps/backend/src/qbo-sync/chart-of-accounts.routes.ts");

function fail(message) {
  console.error(`verify:qbo-sync-coa-no-orphans — FAILED\n- ${message}`);
  process.exit(1);
}

for (const file of [migrationPath, pullerPath, reconcilerPath, routesPath]) {
  if (!fs.existsSync(file)) {
    fail(`${path.relative(ROOT, file)} not found`);
  }
}

const migration = fs.readFileSync(migrationPath, "utf8");
if (!migration.includes("qbo_sync_status")) {
  fail("migration must add qbo_sync_status column");
}
if (!migration.includes("local_only") || !migration.includes("drift_detected")) {
  fail("migration must constrain qbo_sync_status values including local_only and drift_detected");
}

const reconciler = fs.readFileSync(reconcilerPath, "utf8");
if (!reconciler.includes("qbo_account_id IS NULL")) {
  fail("reconciler must detect local rows without qbo_account_id");
}
if (!reconciler.includes("drift_detected")) {
  fail("reconciler must mark drift_detected status");
}
if (!reconciler.includes("local_only")) {
  fail("reconciler must respect local_only status");
}

const routes = fs.readFileSync(routesPath, "utf8");
for (const route of [
  "/api/v1/qbo-sync/chart-of-accounts/pull-now",
  "/api/v1/qbo-sync/chart-of-accounts/reconcile-now",
  "/api/v1/qbo-sync/chart-of-accounts/status",
]) {
  if (!routes.includes(route)) {
    fail(`routes must expose ${route}`);
  }
}

console.log("verify:qbo-sync-coa-no-orphans — OK");
