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

// ACCT-F4431380 (Lead 443.137 item 9e) — OLD: the reconciler had to detect local rows with qbo_account_id IS NULL (markLocalOnlyDrift UPDATE of catalogs.accounts). NEW: reconcileChartOfAccounts() must call refuseQboNativeWrite(), neither reconciler nor puller may write catalogs.accounts, the puller must still fill mdata.qbo_accounts, and the read-only status keeps its drift_detected/local_only counts. WHY: QuickBooks is a read-only archive; the native write was removed and the reconciler refuses by name.
const stripJs = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const NATIVE_COA_WRITE = /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+catalogs\.accounts\b/i;
const reconciler = stripJs(fs.readFileSync(reconcilerPath, "utf8"));
const reconcileFn = /^export\s+async\s+function\s+reconcileChartOfAccounts\b[\s\S]*?\n\}/m.exec(reconciler);
if (!reconcileFn || !/\brefuseQboNativeWrite\s*\(/.test(reconcileFn[0])) {
  fail("reconcileChartOfAccounts() must refuse by name (refuseQboNativeWrite) — never mark/create/heal catalogs.accounts from QBO");
}
if (NATIVE_COA_WRITE.test(reconciler)) {
  fail("reconciler must not write catalogs.accounts (QuickBooks is a read-only archive)");
}
if (!reconciler.includes("drift_detected")) {
  fail("reconciler sync status must still report drift_detected counts");
}
if (!reconciler.includes("local_only")) {
  fail("reconciler sync status must still report local_only counts");
}
const coaPuller = stripJs(fs.readFileSync(pullerPath, "utf8"));
if (NATIVE_COA_WRITE.test(coaPuller)) {
  fail("chart-of-accounts-puller must write only mdata.qbo_accounts, never catalogs.accounts");
}
if (!/INSERT\s+INTO\s+mdata\.qbo_accounts\b/i.test(coaPuller)) {
  fail("chart-of-accounts-puller must still fill its mirror mdata.qbo_accounts");
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
