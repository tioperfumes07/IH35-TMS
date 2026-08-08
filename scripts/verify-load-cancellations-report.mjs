#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
// Rule 17 (no-guard-hotfile-thrash): a guard must NOT require a package.json / ci.yml edit —
// those are the shared hot files every lane contends on, and Rule 17 forbids a new guard from touching
// them. What actually makes a guard run in CI is a verify-step, so check for that and report its
// absence as a NOTE, never as a failure.
const wiredStep__load_cancellations_report = fs
  .readdirSync(path.join(ROOT, "scripts/verify-steps"))
  .some((f) => /^\d+-verify-load-cancellations-report\.mjs$/.test(f));
if (!wiredStep__load_cancellations_report) {
  console.warn(
    "verify-load-cancellations-report: NOTE — no scripts/verify-steps/NNNN-verify-load-cancellations-report.mjs, so this guard does not execute in CI. Wiring it requires a claimed step number (Rule 37); a package.json script does not wire it."
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

const service = read("apps/backend/src/dispatch/cancellation.service.ts");
contains("apps/backend/src/dispatch/cancellation.service.ts", service, [
  { pattern: /getLoadCancellationsAnalytics/, label: "getLoadCancellationsAnalytics export" },
  { pattern: /group_by/, label: "group_by analytics support" },
]);

const routes = read("apps/backend/src/dispatch/cancellation.routes.ts");
contains("apps/backend/src/dispatch/cancellation.routes.ts", routes, [
  { pattern: /\/api\/v1\/dispatch\/load-cancellations\/analytics/, label: "analytics route" },
  { pattern: /group_by: z\.enum\(\["reason", "driver", "customer", "date"\]\)/, label: "group_by query schema" },
]);

const page = read("apps/frontend/src/pages/dispatch/LoadCancellationsReportPage.tsx");
contains("apps/frontend/src/pages/dispatch/LoadCancellationsReportPage.tsx", page, [
  { pattern: /load-cancellations-report-page/, label: "page test id" },
  { pattern: /load-cancellations\/analytics/, label: "analytics API call" },
  { pattern: /ReportsSubNav/, label: "reports sub nav" },
]);

const manifest = read("apps/frontend/src/routes/manifest.tsx");
contains("apps/frontend/src/routes/manifest.tsx", manifest, [
  { pattern: /LoadCancellationsReportPage/, label: "route import" },
  { pattern: /\/reports\/dispatch\/load-cancellations/, label: "report route path" },
]);

const links = read("apps/frontend/src/components/reports/phase6ReportLinks.ts");
contains("apps/frontend/src/components/reports/phase6ReportLinks.ts", links, [
  { pattern: /load-cancellations/, label: "phase6 report href" },
]);

const blockManifest = read(".block-ready/GAP-10-DELTA-CANCELLATIONS-REPORT.json");
contains(".block-ready/GAP-10-DELTA-CANCELLATIONS-REPORT.json", blockManifest, [
  { pattern: /GAP-10-DELTA-CANCELLATIONS-REPORT/, label: "block id" },
]);



if (failures.length > 0) {
  console.error("verify:load-cancellations-report — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:load-cancellations-report — OK");
