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

const viewerService = read("apps/backend/src/safety/eld-audit-trail/viewer.service.ts");
contains("apps/backend/src/safety/eld-audit-trail/viewer.service.ts", viewerService, [
  { pattern: /getEditHistory/, label: "getEditHistory export" },
  { pattern: /getRecentEditHistory/, label: "getRecentEditHistory export" },
  { pattern: /samsara\.hos_log_edits/, label: "hos_log_edits mirror query" },
  { pattern: /read_only/, label: "read-only marker" },
  { pattern: /buildDotAuditPdfPayload/, label: "DOT PDF payload builder" },
]);

const routes = read("apps/backend/src/safety/eld-audit-trail/routes.ts");
contains("apps/backend/src/safety/eld-audit-trail/routes.ts", routes, [
  { pattern: /\/api\/safety\/eld\/audit-trail/, label: "audit trail route" },
  { pattern: /\/api\/safety\/eld\/audit-trail\/driver\/:uuid\/recent/, label: "recent driver route" },
  { pattern: /registerEldAuditTrailRoutes/, label: "routes register export" },
  { pattern: /assertReadOnlySurface/, label: "read-only guard" },
]);

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerEldAuditTrailRoutes/, label: "route registration in index" },
]);

const tests = read("apps/backend/src/safety/eld-audit-trail/__tests__/viewer.test.ts");
contains("apps/backend/src/safety/eld-audit-trail/__tests__/viewer.test.ts", tests, [
  { pattern: /read-only/i, label: "read-only enforcement test" },
  { pattern: /buildDotAuditPdfPayload/, label: "PDF payload test" },
  { pattern: /getEditHistory/, label: "history retrieval test" },
]);

const viewerPage = read("apps/frontend/src/pages/safety/eld/EldAuditTrailViewer.tsx");
contains("apps/frontend/src/pages/safety/eld/EldAuditTrailViewer.tsx", viewerPage, [
  { pattern: /ELD Audit Trail/, label: "viewer page title" },
  { pattern: /audit-trail/, label: "audit trail API call" },
  { pattern: /Export PDF/, label: "DOT PDF export action" },
]);

const timeline = read("apps/frontend/src/components/safety/EldEditHistoryTimeline.tsx");
contains("apps/frontend/src/components/safety/EldEditHistoryTimeline.tsx", timeline, [
  { pattern: /EldEditHistoryTimeline/, label: "timeline component export" },
  { pattern: /audit-trail\/driver/, label: "recent history API call" },
]);

const driverDetail = read("apps/frontend/src/pages/DriverDetail.tsx");
contains("apps/frontend/src/pages/DriverDetail.tsx", driverDetail, [
  { pattern: /ELD Edits/, label: "ELD Edits tab label" },
  { pattern: /EldEditHistoryTimeline/, label: "timeline embedded in driver detail" },
]);

const manifestRoutes = read("apps/frontend/src/routes/manifest.tsx");
contains("apps/frontend/src/routes/manifest.tsx", manifestRoutes, [
  { pattern: /EldAuditTrailViewer/, label: "audit trail route component" },
  { pattern: /\/safety\/eld\/audit-trail/, label: "audit trail route path" },
]);

const docs = read("docs/specs/gap-83-eld-audit-trail.md");
contains("docs/specs/gap-83-eld-audit-trail.md", docs, [
  { pattern: /GAP-83/, label: "GAP-83 identifier" },
  { pattern: /\/api\/safety\/eld\/audit-trail/, label: "routes documented" },
  { pattern: /read-only/i, label: "read-only documented" },
]);

const blockManifest = read(".block-ready/GAP-83-ELD-AUDIT-VIEWER.json");
contains(".block-ready/GAP-83-ELD-AUDIT-VIEWER.json", blockManifest, [
  { pattern: /GAP-83-ELD-AUDIT-VIEWER/, label: "GAP-83 block id in manifest" },
]);

const packageJson = read("package.json");
contains("package.json", packageJson, [
  { pattern: /verify:eld-audit-trail/, label: "verify script in package.json" },
]);

const ci = read(".github/workflows/ci.yml");
contains(".github/workflows/ci.yml", ci, [
  { pattern: /verify:eld-audit-trail/, label: "verify step in CI" },
]);

if (failures.length > 0) {
  console.error("verify:eld-audit-trail — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:eld-audit-trail — OK");
