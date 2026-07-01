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

const monitorService = read("apps/backend/src/safety/expiry-tracking/cert-monitor.service.ts");
contains("apps/backend/src/safety/expiry-tracking/cert-monitor.service.ts", monitorService, [
  { pattern: /scanAllDrivers/, label: "scanAllDrivers export" },
  { pattern: /computeSeverity/, label: "computeSeverity export" },
  { pattern: /cdl_expires_at/, label: "CDL tracking query" },
  { pattern: /dot_medical_expires_at/, label: "medical card fallback" },
  { pattern: /twic_expires_at/, label: "TWIC tracking" },
]);

const routes = read("apps/backend/src/safety/expiry-tracking/routes.ts");
contains("apps/backend/src/safety/expiry-tracking/routes.ts", routes, [
  { pattern: /\/api\/safety\/cert-expiry\/all/, label: "all alerts route" },
  { pattern: /\/api\/safety\/cert-expiry\/driver\/:uuid/, label: "driver alerts route" },
  { pattern: /registerCertExpiryTrackingRoutes/, label: "routes register export" },
]);

const worker = read("apps/backend/src/jobs/cert-expiry-monitor.ts");
contains("apps/backend/src/jobs/cert-expiry-monitor.ts", worker, [
  { pattern: /0 6 \* \* \*/, label: "06:00 daily cron schedule" },
  { pattern: /initializeCertExpiryMonitor/, label: "worker init export" },
  { pattern: /notifyCriticalExpiries/, label: "critical notifier integration" },
]);

read("apps/backend/src/safety/expiry-tracking/__tests__/cert-monitor.test.ts");

const dashboard = read("apps/frontend/src/pages/safety/expiry-tracking/ExpiryDashboard.tsx");
contains("apps/frontend/src/pages/safety/expiry-tracking/ExpiryDashboard.tsx", dashboard, [
  { pattern: /Certificate Expiry Dashboard/, label: "dashboard title" },
  { pattern: /cert-expiry\/all/, label: "cert expiry API call" },
  { pattern: /severity/i, label: "severity filter" },
]);

const badge = read("apps/frontend/src/components/safety/CertExpiryBadge.tsx");
contains("apps/frontend/src/components/safety/CertExpiryBadge.tsx", badge, [
  { pattern: /CertExpiryBadge/, label: "badge component export" },
  { pattern: /critical/, label: "critical badge state" },
  { pattern: /warn/, label: "warn badge state" },
]);

// SAFETY-2: Cert Expiry now has its own route /safety/cert-expiry (was aliased onto /safety/dot-compliance,
// which broke active-tab/breadcrumb). Its nav config now lives in SAFETY_TABS_CONFIG.ts.
const nav = read("apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts");
contains("apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts", nav, [
  { pattern: /cert-expiry/, label: "cert expiry nav entry" },
  { pattern: /\/safety\/cert-expiry/, label: "cert expiry target route" },
]);

const dotTab = read("apps/frontend/src/pages/safety/tabs/DOTComplianceTab.tsx");
contains("apps/frontend/src/pages/safety/tabs/DOTComplianceTab.tsx", dotTab, [
  { pattern: /ExpiryDashboard/, label: "dashboard mounted in DOT compliance tab" },
]);

const docs = read("docs/specs/gap-82-cert-expiry-tracking.md");
contains("docs/specs/gap-82-cert-expiry-tracking.md", docs, [
  { pattern: /GAP-82/, label: "GAP-82 identifier" },
  { pattern: /api\/safety\/cert-expiry\/all/, label: "routes documented" },
]);

const manifest = read(".block-ready.json");
if (/GAP-82-MEDICAL-CARD-TRACKING/.test(manifest)) {
  contains(".block-ready.json", manifest, [
    { pattern: /GAP-82-MEDICAL-CARD-TRACKING/, label: "GAP-82 block id in manifest" },
  ]);
}

if (failures.length > 0) {
  console.error("verify:cert-expiry-tracking — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:cert-expiry-tracking — OK");
