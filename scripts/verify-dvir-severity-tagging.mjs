#!/usr/bin/env node
/**
 * GAP-49 CI guard — DVIR defect severity tagging (major vs minor vs observation).
 *
 * Asserts the additive surface is present and wired:
 *   - migration creates the append-only severity-tag table
 *   - major defect catalog is locked with CFR codes
 *   - severity + routing services exist
 *   - pre-flight routes exist and are registered in index.ts
 *   - dispatcher queue page + severity badge present and routed
 *   - driver PWA exposes the severity picker
 *   - spec doc cites G18 / WF-050 / 49 CFR §396.11
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      failures.push(`${relativePath}: missing ${check.label}`);
    }
  }
}

const migration = read("db/migrations/0408_dvir_defect_severity_tagging.sql");
contains("db/migrations/0408_dvir_defect_severity_tagging.sql", migration, [
  { pattern: /safety\.dvir_defect_severity_tags/, label: "severity tag table" },
  { pattern: /severity text NOT NULL CHECK \(severity IN \('major', 'minor', 'observation'\)\)/, label: "three severity levels" },
  { pattern: /ENABLE ROW LEVEL SECURITY/, label: "RLS enabled" },
  { pattern: /GRANT SELECT, INSERT ON safety\.dvir_defect_severity_tags TO ih35_app/, label: "append-only grant to ih35_app" },
]);

const catalog = read("apps/backend/src/maintenance/pre-flight/major-defect-catalog.ts");
contains("apps/backend/src/maintenance/pre-flight/major-defect-catalog.ts", catalog, [
  { pattern: /export const MAJOR_DEFECT_CODES/, label: "MAJOR_DEFECT_CODES export" },
  { pattern: /BRAKE_AIR_LEAK/, label: "brake air leak code" },
  { pattern: /396\.11/, label: "49 CFR §396.11 citations" },
  { pattern: /classifyMajorDefect/, label: "classifier export" },
]);

const severityService = read("apps/backend/src/maintenance/pre-flight/dvir-severity.service.ts");
contains("apps/backend/src/maintenance/pre-flight/dvir-severity.service.ts", severityService, [
  { pattern: /export function classifyDefect/, label: "classifyDefect" },
  { pattern: /export async function setSeverity/, label: "setSeverity override" },
  { pattern: /canOverrideMajor/, label: "Manager+ RBAC gate" },
  { pattern: /appendCrudAudit/, label: "audit trail" },
]);

const routingService = read("apps/backend/src/maintenance/pre-flight/dvir-routing.service.ts");
contains("apps/backend/src/maintenance/pre-flight/dvir-routing.service.ts", routingService, [
  { pattern: /export async function routeDefect/, label: "routeDefect" },
  { pattern: /INSERT INTO maintenance\.work_orders/, label: "auto-WO on major" },
  { pattern: /queued_next_pm/, label: "minor → next PM queue" },
  { pattern: /logged_observation/, label: "observation → log only" },
]);

const routes = read("apps/backend/src/maintenance/pre-flight/routes.ts");
contains("apps/backend/src/maintenance/pre-flight/routes.ts", routes, [
  { pattern: /\/api\/v1\/maintenance\/pre-flight\/dvir-queue/, label: "dvir-queue route" },
  { pattern: /\/api\/v1\/maintenance\/pre-flight\/defects\/:id\/severity/, label: "severity PATCH route" },
  { pattern: /\/api\/v1\/maintenance\/pre-flight\/major-defect-catalog/, label: "catalog route" },
  { pattern: /registerPreFlightDvirRoutes/, label: "register export" },
]);

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerPreFlightDvirRoutes/, label: "pre-flight routes wired in index" },
]);

const queuePage = read("apps/frontend/src/pages/maintenance/pre-flight/PreFlightDvirQueue.tsx");
contains("apps/frontend/src/pages/maintenance/pre-flight/PreFlightDvirQueue.tsx", queuePage, [
  { pattern: /PreFlightDvirQueue/, label: "queue page export" },
  { pattern: /pre-flight-dvir-queue/, label: "queue page test id" },
  { pattern: /DvirSeverityBadge/, label: "severity badge usage" },
  { pattern: /dvir-severity-tab-/, label: "severity tabs" },
]);

const badge = read("apps/frontend/src/components/maintenance/DvirSeverityBadge.tsx");
contains("apps/frontend/src/components/maintenance/DvirSeverityBadge.tsx", badge, [
  { pattern: /export function DvirSeverityBadge/, label: "badge export" },
  { pattern: /observation/, label: "observation level" },
]);

const manifest = read("apps/frontend/src/routes/manifest.tsx");
contains("apps/frontend/src/routes/manifest.tsx", manifest, [
  { pattern: /\/maintenance\/pre-flight\/dvir/, label: "queue route registered" },
  { pattern: /PreFlightDvirQueue/, label: "queue page imported" },
]);

const woDetail = read("apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx");
contains("apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx", woDetail, [
  { pattern: /DvirSeverityBadge/, label: "severity badge on WO detail" },
]);

const pwa = read("apps/driver-pwa/src/pages/DVIR.tsx");
contains("apps/driver-pwa/src/pages/DVIR.tsx", pwa, [
  { pattern: /dvir\.severity_picker/, label: "PWA severity picker" },
  { pattern: /dvir-major-ack/, label: "PWA major confirmation" },
]);

const docs = read("docs/specs/gap-49-dvir-severity-tagging.md");
contains("docs/specs/gap-49-dvir-severity-tagging.md", docs, [
  { pattern: /GAP-49/, label: "GAP-49 identifier" },
  { pattern: /WF-050/, label: "WF-050 citation" },
  { pattern: /396\.11/, label: "49 CFR §396.11 citation" },
  { pattern: /G18/, label: "G18 master rule citation" },
]);

if (failures.length > 0) {
  console.error("verify:dvir-severity-tagging — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:dvir-severity-tagging — OK");
