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

const service = read("apps/backend/src/dispatch/analytics/late-arrival.service.ts");
contains("apps/backend/src/dispatch/analytics/late-arrival.service.ts", service, [
  { pattern: /aggregateLateArrivals/, label: "aggregateLateArrivals export" },
  { pattern: /"driver"/, label: "driver grouping" },
  { pattern: /"customer"/, label: "customer grouping" },
  { pattern: /"lane"/, label: "lane grouping" },
  { pattern: /chronic_offender/, label: "chronic offender flag" },
]);

const routes = read("apps/backend/src/dispatch/analytics/late-arrival.routes.ts");
contains("apps/backend/src/dispatch/analytics/late-arrival.routes.ts", routes, [
  { pattern: /\/api\/v1\/dispatch\/analytics\/late-arrivals/, label: "aggregate route" },
  { pattern: /registerLateArrivalAnalyticsRoutes/, label: "routes register export" },
]);

read("apps/backend/src/dispatch/analytics/__tests__/late-arrival.test.ts");

const worker = read("apps/backend/src/jobs/late-arrival-aggregator-worker.ts");
contains("apps/backend/src/jobs/late-arrival-aggregator-worker.ts", worker, [
  { pattern: /initializeLateArrivalAggregatorWorker/, label: "worker initializer" },
  { pattern: /6 \* 60 \* 60 \* 1000/, label: "6h interval" },
]);

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerLateArrivalAnalyticsRoutes/, label: "analytics routes registered" },
  { pattern: /initializeLateArrivalAggregatorWorker/, label: "worker registered" },
]);

const report = read("apps/frontend/src/pages/reports/LateArrivalReport.tsx");
contains("apps/frontend/src/pages/reports/LateArrivalReport.tsx", report, [
  { pattern: /late-arrival-report-page/, label: "report test id" },
  { pattern: /\/api\/v1\/dispatch\/analytics\/late-arrivals/, label: "report API fetch" },
]);

read("apps/frontend/src/components/drivers/DriverLateArrivalCard.tsx");
read("apps/frontend/src/components/customers/CustomerLateArrivalCard.tsx");

const manifest = read("apps/frontend/src/routes/manifest.tsx");
contains("apps/frontend/src/routes/manifest.tsx", manifest, [
  { pattern: /LateArrivalReport/, label: "LateArrivalReport import" },
  { pattern: /path="\/reports\/late-arrival"/, label: "late-arrival route" },
]);

read("docs/specs/gap-30-late-arrival-analytics.md");

const blockManifest = read(".block-ready/GAP-30.json");
contains(".block-ready/GAP-30.json", blockManifest, [
  { pattern: /GAP-30/, label: "GAP-30 block id" },
  { pattern: /verify:late-arrival-analytics/, label: "verify gate in manifest" },
]);

const pkg = read("package.json");
contains("package.json", pkg, [
  { pattern: /verify:late-arrival-analytics/, label: "npm script for verify gate" },
]);

const ci = read(".github/workflows/ci.yml");
contains(".github/workflows/ci.yml", ci, [
  { pattern: /verify:late-arrival-analytics/, label: "CI workflow runs verify gate" },
]);

if (failures.length > 0) {
  console.error("verify:late-arrival-analytics — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:late-arrival-analytics — OK");
