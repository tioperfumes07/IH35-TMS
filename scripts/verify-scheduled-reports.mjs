#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      fail(`${relativePath}: missing ${check.label}`);
    }
  }
}

const migration = read("db/migrations/202606080206_scheduled_report_subscriptions.sql");
contains("db/migrations/202606080206_scheduled_report_subscriptions.sql", migration, [
  { pattern: /reports\.scheduled_subscriptions/, label: "scheduled_subscriptions table" },
  { pattern: /reports\.scheduled_delivery_log/, label: "scheduled_delivery_log table" },
  { pattern: /weekly-cash-position/, label: "weekly-cash-position seed" },
  { pattern: /weekly-driver-settlement-preview/, label: "weekly-driver-settlement-preview seed" },
  { pattern: /weekly-ar-aging-60/, label: "weekly-ar-aging-60 seed" },
  { pattern: /monthly-pnl/, label: "monthly-pnl seed" },
  { pattern: /quarterly-ifta-preview/, label: "quarterly-ifta-preview seed" },
  { pattern: /daily-safety-alerts-digest/, label: "daily-safety-alerts-digest seed" },
  { pattern: /scheduled_subs_tenant_scope/, label: "RLS policy on subscriptions" },
  { pattern: /GRANT SELECT, INSERT, UPDATE ON reports\.scheduled_subscriptions TO ih35_app/, label: "ih35_app grants" },
]);

const routes = read("apps/backend/src/reports/scheduled/routes.ts");
contains("apps/backend/src/reports/scheduled/routes.ts", routes, [
  { pattern: /\/api\/v1\/reports\/scheduled\/subscriptions/, label: "subscriptions list route" },
  { pattern: /app\.post\("\/api\/v1\/reports\/scheduled\/subscriptions"/, label: "subscriptions create route" },
  { pattern: /subscriptions\/:uuid\/deactivate/, label: "deactivate route (no delete)" },
  { pattern: /\/api\/v1\/reports\/scheduled\/delivery-log/, label: "delivery log route" },
  { pattern: /requireOwner/, label: "Owner-only guard" },
  { pattern: /registerScheduledSubscriptionRoutes/, label: "routes register export" },
]);

const worker = read("apps/backend/src/jobs/scheduled-reports-emailer.ts");
contains("apps/backend/src/jobs/scheduled-reports-emailer.ts", worker, [
  { pattern: /\*\/15 \* \* \* \*/, label: "15-minute cron" },
  { pattern: /initializeScheduledReportsEmailer/, label: "worker initializer" },
  { pattern: /runDue/, label: "runner wired" },
]);

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerScheduledSubscriptionRoutes/, label: "routes registered in index.ts" },
  { pattern: /initializeScheduledReportsEmailer/, label: "worker registered in index.ts" },
]);

const runner = read("apps/backend/src/reports/scheduled/runner.service.ts");
contains("apps/backend/src/reports/scheduled/runner.service.ts", runner, [
  { pattern: /enqueueEmail/, label: "enqueueEmail integration" },
  { pattern: /appendDeliveryLog/, label: "delivery log writes" },
]);

read("apps/backend/src/reports/scheduled/__tests__/scheduled.test.ts");

const manager = read("apps/frontend/src/pages/reports/SubscriptionManager.tsx");
contains("apps/frontend/src/pages/reports/SubscriptionManager.tsx", manager, [
  { pattern: /SubscriptionManager/, label: "SubscriptionManager export" },
  { pattern: /subscription-manager/, label: "subscription manager test id" },
  { pattern: /\/api\/v1\/reports\/scheduled\/subscriptions/, label: "subscriptions API wired" },
]);

read("apps/frontend/src/components/reports/SubscriptionEditor.tsx");

const manifest = read("apps/frontend/src/routes/manifest.tsx");
contains("apps/frontend/src/routes/manifest.tsx", manifest, [
  { pattern: /SubscriptionManager/, label: "SubscriptionManager in manifest" },
  { pattern: /\/reports\/scheduled/, label: "/reports/scheduled route" },
]);

const pkg = read("package.json");
contains("package.json", pkg, [
  { pattern: /verify:scheduled-reports/, label: "verify:scheduled-reports script" },
]);

const ci = read(".github/workflows/ci.yml");
contains(".github/workflows/ci.yml", ci, [
  { pattern: /verify:scheduled-reports/, label: "CI verify:scheduled-reports gate" },
]);

read("docs/specs/gap-43-scheduled-reports.md");

if (failures.length > 0) {
  console.error("verify:scheduled-reports FAIL");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log("verify:scheduled-reports PASS");
