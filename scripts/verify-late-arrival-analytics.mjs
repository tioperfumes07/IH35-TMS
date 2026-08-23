#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
// Rule 17 (no-guard-hotfile-thrash): a guard must NOT require a package.json / ci.yml edit —
// those are the shared hot files every lane contends on, and Rule 17 forbids a new guard from touching
// them. What actually makes a guard run in CI is a verify-step, so check for that and report its
// absence as a NOTE, never as a failure.
const wiredStep__late_arrival_analytics = fs
  .readdirSync(path.join(ROOT, "scripts/verify-steps"))
  .some((f) => /^\d+-verify-late-arrival-analytics\.mjs$/.test(f));
if (!wiredStep__late_arrival_analytics) {
  console.warn(
    "verify-late-arrival-analytics: NOTE — no scripts/verify-steps/NNNN-verify-late-arrival-analytics.mjs, so this guard does not execute in CI. Wiring it requires a claimed step number (Rule 37); a package.json script does not wire it."
  );
}

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

const driverCard = read("apps/frontend/src/components/drivers/DriverLateArrivalCard.tsx");
function driverCardFailures(source) {
  return [
    !/query\.isError[\s\S]{0,260}<ListErrorState[\s\S]{0,220}onRetry=\{\(\) => void query\.refetch\(\)\}/.test(source)
      ? "driver late-arrival GET failure must be distinct from empty and exactly retryable"
      : null,
    /query\.isError \|\| !query\.data/.test(source)
      ? "driver late-arrival failure must not masquerade as no data"
      : null,
  ].filter(Boolean);
}
failures.push(...driverCardFailures(driverCard));
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



if (process.argv.includes("--selftest")) {
  if (failures.length) throw new Error(`baseline failed: ${failures.join("; ")}`);
  const mutations = [
    driverCard.replace("onRetry={() => void query.refetch()}", "onRetry={() => undefined}"),
    driverCard.replace("if (query.isError) {", "if (query.isError || !query.data) {"),
  ];
  for (const [index, mutated] of mutations.entries()) {
    if (mutated === driverCard || driverCardFailures(mutated).length === 0) throw new Error(`driver-card mutation ${index + 1} escaped`);
  }
  console.log("verify:late-arrival-analytics SELFTEST PASS — 2/2 driver failure/empty mutations red");
  process.exit(0);
}

if (failures.length > 0) {
  console.error("verify:late-arrival-analytics — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:late-arrival-analytics — OK");
