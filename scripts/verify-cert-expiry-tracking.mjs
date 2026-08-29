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
function sharedDriverScopeFailures(source) {
  const required = [
    "driver_company_authorizations cert_expiry_driver_dca",
    "cert_expiry_driver_dca.driver_id = d.id",
    "cert_expiry_driver_dca.company_id = $1::uuid",
    "cert_expiry_driver_dca.is_authorized = true",
    "cert_expiry_driver_dca.deactivated_at IS NULL",
  ];
  return required.filter((token) => !source.includes(token));
}
contains("apps/backend/src/safety/expiry-tracking/cert-monitor.service.ts", monitorService, [
  { pattern: /scanAllDrivers/, label: "scanAllDrivers export" },
  { pattern: /computeSeverity/, label: "computeSeverity export" },
  { pattern: /cdl_expires_at/, label: "CDL tracking query" },
  { pattern: /dot_medical_expires_at/, label: "medical card fallback" },
  { pattern: /twic_expires_at/, label: "TWIC tracking" },
]);
for (const token of sharedDriverScopeFailures(monitorService)) {
  fail(`apps/backend/src/safety/expiry-tracking/cert-monitor.service.ts: missing shared-driver scope ${token}`);
}

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

const alerter = read("apps/backend/src/safety/expiry-tracking/alerter.service.ts");
const deliveryHandler = read("apps/backend/src/outbox/handlers/safety-cert-expiry-critical-notification.handler.ts");
const outboxRegistry = read("apps/backend/src/outbox/handlers/registry.ts");
contains("apps/backend/src/safety/expiry-tracking/alerter.service.ts", alerter, [
  { pattern: /enqueueOutboxEvent\(/, label: "canonical durable notification enqueue" },
  { pattern: /"safety\.cert_expiry\.critical_notification"/, label: "typed critical expiry event" },
  { pattern: /safety-cert-expiry:\$\{operatingCompanyId\}:\$\{alert\.driver_uuid\}:\$\{alert\.cert_type\}:\$\{alert\.expiry_date\}/, label: "company+driver+cert+expiry dedupe key" },
]);
if (/sendEmail\(/.test(alerter) || /createNotification\(/.test(alerter)) {
  fail("apps/backend/src/safety/expiry-tracking/alerter.service.ts: daily scan must not directly redeliver provider/in-app notifications");
}
contains("apps/backend/src/outbox/handlers/safety-cert-expiry-critical-notification.handler.ts", deliveryHandler, [
  { pattern: /requiresDelivery\s*=\s*true/, label: "required delivery contract" },
  { pattern: /await sendEmail\(/, label: "awaited email delivery" },
  { pattern: /await createNotification\(/, label: "awaited in-app delivery" },
]);
contains("apps/backend/src/outbox/handlers/registry.ts", outboxRegistry, [
  { pattern: /new SafetyCertExpiryCriticalNotificationHandler\(\)/, label: "registered critical expiry handler" },
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

// SAFETY-2: Cert Expiry has its own route /safety/cert-expiry (distinct from /safety/dot-compliance)
// AND mounts ExpiryDashboard — not DOTComplianceTab (which embeds ExpiryDashboard + reminders/CFR).
const nav = read("apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts");
contains("apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts", nav, [
  { pattern: /cert-expiry/, label: "cert expiry nav entry" },
  { pattern: /\/safety\/cert-expiry/, label: "cert expiry target route" },
]);

const routeManifest = read("apps/frontend/src/routes/manifest.tsx");
contains("apps/frontend/src/routes/manifest.tsx", routeManifest, [
  {
    pattern: /path=["']cert-expiry["']\s+element=\{<ExpiryDashboard\s*\/>\}/,
    label: "cert-expiry route mounts ExpiryDashboard (not DOTComplianceTab)",
  },
  {
    pattern: /path=["']dot-compliance["']\s+element=\{<DOTComplianceTab\s*\/>\}/,
    label: "dot-compliance keeps DOTComplianceTab",
  },
]);
if (/path=["']cert-expiry["']\s+element=\{<DOTComplianceTab\s*\/>\}/.test(routeManifest)) {
  fail("apps/frontend/src/routes/manifest.tsx: cert-expiry must not mount DOTComplianceTab");
}

const dotTab = read("apps/frontend/src/pages/safety/tabs/DOTComplianceTab.tsx");
contains("apps/frontend/src/pages/safety/tabs/DOTComplianceTab.tsx", dotTab, [
  { pattern: /ExpiryDashboard/, label: "dashboard mounted in DOT compliance tab" },
]);

function breadcrumbContextFailures(dashboardSource, dotTabSource) {
  const contextFailures = [];
  if (!/breadcrumbLabel\?:\s*"Cert Expiry"\s*\|\s*"DOT Compliance"/.test(dashboardSource)) {
    contextFailures.push("dashboard breadcrumb contract is not restricted to its two route contexts");
  }
  if (!/breadcrumbLabel\s*=\s*"Cert Expiry"/.test(dashboardSource)) {
    contextFailures.push("standalone cert-expiry route lost its Cert Expiry default");
  }
  if (!/breadcrumb=\{\[\{ label: "Safety" \}, \{ label: breadcrumbLabel \}\]\}/.test(dashboardSource)) {
    contextFailures.push("PageHeader does not render the route-aware breadcrumb label");
  }
  if (!/<ExpiryDashboard\s+breadcrumbLabel="DOT Compliance"\s*\/>/.test(dotTabSource)) {
    contextFailures.push("DOT Compliance embedding does not identify its own route context");
  }
  return contextFailures;
}

for (const message of breadcrumbContextFailures(dashboard, dotTab)) {
  fail(`safety cert-expiry breadcrumb: ${message}`);
}

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

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["authorization table", "driver_company_authorizations cert_expiry_driver_dca", "drivers cert_expiry_driver_dca"],
    ["authorization company", "cert_expiry_driver_dca.company_id = $1::uuid", "cert_expiry_driver_dca.company_id = d.operating_company_id"],
    ["authorization active", "cert_expiry_driver_dca.is_authorized = true", "cert_expiry_driver_dca.is_authorized = false"],
    ["authorization lifecycle", "cert_expiry_driver_dca.deactivated_at IS NULL", "cert_expiry_driver_dca.deactivated_at IS NOT NULL"],
  ];
  for (const [name, before, after] of mutations) {
    const mutated = monitorService.replace(before, after);
    if (mutated === monitorService || sharedDriverScopeFailures(mutated).length === 0) {
      console.error(`verify:cert-expiry-tracking --selftest FAILED: ${name} mutation escaped`);
      process.exit(1);
    }
  }
  const durabilityMutations = [
    ["outbox bypass", alerter, "enqueueOutboxEvent(", "sendEmail("],
    ["dedupe identity", alerter, "${alert.cert_type}:${alert.expiry_date}", "static-key"],
    ["required delivery", deliveryHandler, "requiresDelivery = true", "requiresDelivery = false"],
    ["handler registration", outboxRegistry, "new SafetyCertExpiryCriticalNotificationHandler(),", ""],
  ];
  for (const [name, source, before, after] of durabilityMutations) {
    const mutated = source.replace(before, after);
    const stillValid =
      name === "outbox bypass" ? /enqueueOutboxEvent\(/.test(mutated) && !/sendEmail\(/.test(mutated) :
      name === "dedupe identity" ? /\$\{alert\.cert_type\}:\$\{alert\.expiry_date\}/.test(mutated) :
      name === "required delivery" ? /requiresDelivery\s*=\s*true/.test(mutated) :
      /new SafetyCertExpiryCriticalNotificationHandler\(\)/.test(mutated);
    if (mutated === source || stillValid) {
      console.error(`verify:cert-expiry-tracking --selftest FAILED: ${name} mutation escaped`);
      process.exit(1);
    }
  }
  const breadcrumbMutations = [
    ["standalone default", dashboard, 'breadcrumbLabel = "Cert Expiry"', 'breadcrumbLabel = "DOT Compliance"', dotTab],
    ["route-aware PageHeader", dashboard, '{ label: breadcrumbLabel }', '{ label: "Cert Expiry" }', dotTab],
    ["DOT embed context", dotTab, '<ExpiryDashboard breadcrumbLabel="DOT Compliance" />', '<ExpiryDashboard />', dashboard],
  ];
  for (const [name, source, before, after, sibling] of breadcrumbMutations) {
    const mutated = source.replace(before, after);
    const [mutatedDashboard, mutatedDotTab] = source === dashboard ? [mutated, sibling] : [sibling, mutated];
    if (mutated === source || breadcrumbContextFailures(mutatedDashboard, mutatedDotTab).length === 0) {
      console.error(`verify:cert-expiry-tracking --selftest FAILED: ${name} mutation escaped`);
      process.exit(1);
    }
  }
  const mutationCount = mutations.length + durabilityMutations.length + breadcrumbMutations.length;
  console.log(`verify:cert-expiry-tracking --selftest OK — ${mutationCount}/${mutationCount} mutations detected`);
  process.exit(0);
}

if (failures.length > 0) {
  console.error("verify:cert-expiry-tracking — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:cert-expiry-tracking — OK");
