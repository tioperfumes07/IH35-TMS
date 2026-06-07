#!/usr/bin/env node
/**
 * DISPATCH-LIVE-ETA: CI guard — live ETA columns wired without per-row fetches.
 */
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

function mustNotContain(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (pattern.test(content)) {
      fail(`${relativePath}: forbidden ${check.label}`);
    }
  }
}

const dispatchList = read("apps/frontend/src/components/dispatch/DispatchList.tsx");
contains("apps/frontend/src/components/dispatch/DispatchList.tsx", dispatchList, [
  { pattern: /DriverStatusColumn/, label: "DriverStatusColumn import/usage" },
  { pattern: /SamsaraEtaColumn/, label: "SamsaraEtaColumn import/usage" },
  { pattern: /OnTimePredictionColumn/, label: "OnTimePredictionColumn import/usage" },
  { pattern: /LiveEtaFreshnessColumn/, label: "LiveEtaFreshnessColumn import/usage" },
  { pattern: /Driver Status/, label: "Driver Status column header" },
  { pattern: /Samsara ETA/, label: "Samsara ETA column header" },
  { pattern: /On-time/, label: "On-time column header" },
  { pattern: /Freshness/, label: "Freshness column header" },
]);
mustNotContain("apps/frontend/src/components/dispatch/DispatchList.tsx", dispatchList, [
  { pattern: /InTransitEtaChip/, label: "per-row InTransitEtaChip" },
  { pattern: /getDispatchLoadEta/, label: "per-row getDispatchLoadEta" },
]);

const liveEtaColumns = read("apps/frontend/src/components/dispatch/LiveEtaColumns.tsx");
contains("apps/frontend/src/components/dispatch/LiveEtaColumns.tsx", liveEtaColumns, [
  { pattern: /from "\.\/FreshnessIndicator"/, label: "FreshnessIndicator import from GAP-24 path" },
  { pattern: /driver-status-column/, label: "driver status test id" },
  { pattern: /samsara-eta-column/, label: "samsara eta test id" },
  { pattern: /on-time-prediction-column/, label: "on-time prediction test id" },
]);

read("apps/frontend/src/components/dispatch/LiveEtaColumns.test.tsx");
read("apps/backend/src/telematics/dispatch-live-eta.service.ts");
read("apps/backend/src/telematics/__tests__/dispatch-live-eta.test.ts");

const loadsApi = read("apps/frontend/src/api/loads.ts");
contains("apps/frontend/src/api/loads.ts", loadsApi, [
  { pattern: /include_live_eta/, label: "include_live_eta filter" },
  { pattern: /driver_pwa_last_ping_at/, label: "driver_pwa_last_ping_at type" },
  { pattern: /samsara_eta_at/, label: "samsara_eta_at type" },
  { pattern: /on_time_prediction/, label: "on_time_prediction type" },
]);

const dispatchPage = read("apps/frontend/src/pages/Dispatch.tsx");
contains("apps/frontend/src/pages/Dispatch.tsx", dispatchPage, [
  { pattern: /include_live_eta:\s*true/, label: "include_live_eta board query flag" },
]);

const loadsRoutes = read("apps/backend/src/mdata/loads.routes.ts");
contains("apps/backend/src/mdata/loads.routes.ts", loadsRoutes, [
  { pattern: /include_live_eta/, label: "include_live_eta query param" },
  { pattern: /enrichLoadsLiveEta/, label: "enrichLoadsLiveEta enrichment" },
]);

const manifest = read(".block-ready/DISPATCH-LIVE-ETA.json");
contains(".block-ready/DISPATCH-LIVE-ETA.json", manifest, [
  { pattern: /"block_id":\s*"DISPATCH-LIVE-ETA"/, label: "block_id" },
  { pattern: /verify:dispatch-eta-columns/, label: "extra_gates verify script" },
  { pattern: /DispatchBoard\.tsx/, label: "DispatchBoard forbidden path" },
]);

const pkg = read("package.json");
contains("package.json", pkg, [
  {
    pattern: /"verify:dispatch-eta-columns":\s*"node scripts\/verify-dispatch-eta-columns\.mjs"/,
    label: "npm script",
  },
]);

const ci = read(".github/workflows/ci.yml");
contains(".github/workflows/ci.yml", ci, [
  { pattern: /verify:dispatch-eta-columns/, label: "CI workflow step" },
]);

if (failures.length) {
  console.error("verify:dispatch-eta-columns FAIL:");
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}

console.log("verify:dispatch-eta-columns OK");
