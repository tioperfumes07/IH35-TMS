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
// Live path reads Samsara HOS edits via API (getHosLogs). The old samsara.hos_log_edits mirror
// was never provisioned (phantom / Jorge-gated) and is banned by verify-safety-eld-audit-connectivity.
contains("apps/backend/src/safety/eld-audit-trail/viewer.service.ts", viewerService, [
  { pattern: /getEditHistory/, label: "getEditHistory export" },
  { pattern: /getRecentEditHistory/, label: "getRecentEditHistory export" },
  { pattern: /getHosLogs|SamsaraClient/, label: "live Samsara HOS edit fetch (not phantom hos_log_edits)" },
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

function auditTimelineRecovery(source) {
  const problems = [];
  if (!/!isControlled && historyQuery\.isError/.test(source)) problems.push("self-fetch failure must be distinct from controlled mode");
  if (!/<ListErrorState[\s\S]{0,320}onRetry=\{\(\) => void historyQuery\.refetch\(\)\}/.test(source)) problems.push("self-fetch failure must expose exact-query retry");
  if (!/historyQuery\.isError[\s\S]{0,500}if \(edits\.length === 0\)/.test(source)) problems.push("failure branch must precede the true-empty audit state");
  return problems;
}
for (const problem of auditTimelineRecovery(timeline)) fail(`apps/frontend/src/components/safety/EldEditHistoryTimeline.tsx: ${problem}`);

const driverDetail = read("apps/frontend/src/pages/DriverDetail.tsx");
contains("apps/frontend/src/pages/DriverDetail.tsx", driverDetail, [
  { pattern: /ELD Edits/, label: "ELD Edits tab label" },
  { pattern: /EldEditHistoryTimeline/, label: "timeline embedded in driver detail" },
]);

const manifestRoutes = read("apps/frontend/src/routes/manifest.tsx");
contains("apps/frontend/src/routes/manifest.tsx", manifestRoutes, [
  { pattern: /EldAuditTrailViewer/, label: "audit trail route component" },
  // SAF-F27: relative-only under path="/safety" → path="eld/audit-trail" (absolute still accepted).
  {
    pattern: /path=["'](?:\/safety\/)?eld\/audit-trail["']/,
    label: "audit trail route path",
  },
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

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["error-mode-gate", /!isControlled && historyQuery\.isError/, "historyQuery.isError"],
    ["exact-retry", /onRetry=\{\(\) => void historyQuery\.refetch\(\)\}/, "onRetry={undefined}"],
    ["failure-before-empty", /if \(!isControlled && historyQuery\.isError\)/, "if (false)"],
  ];
  for (const [name, pattern, replacement] of mutations) {
    const mutated = timeline.replace(pattern, replacement);
    if (mutated === timeline || auditTimelineRecovery(mutated).length === 0) {
      console.error(`verify:eld-audit-trail --selftest FAILED: ${name} mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`verify:eld-audit-trail --selftest OK — ${mutations.length}/${mutations.length} mutations detected`);
  process.exit(0);
}

if (failures.length > 0) {
  console.error("verify:eld-audit-trail — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:eld-audit-trail — OK");
