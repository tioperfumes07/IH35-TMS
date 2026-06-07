#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

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

const pkg = read("package.json");
contains("package.json", pkg, [
  { pattern: /verify:load-cancellations-report/, label: "npm verify script" },
]);

const ci = read(".github/workflows/ci.yml");
contains(".github/workflows/ci.yml", ci, [
  { pattern: /verify:load-cancellations-report/, label: "CI verify step" },
]);

if (failures.length > 0) {
  console.error("verify:load-cancellations-report — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:load-cancellations-report — OK");
