#!/usr/bin/env node
/**
 * verify-safety-kpi-drillthrough.mjs — SAFETY-KPI-DRILLTHROUGH guard
 *
 * Proves the Safety Home KPI tiles + Safety Officer alerts drill to a SPECIFIC driver / unit / record
 * (via ids the backend already returns), never dumping the user on a bare `/safety` list.
 *
 * Layer 1 — FE Safety Home tab (apps/frontend/src/pages/safety/tabs/SafetyHomeTab.tsx):
 *   - a dedicated drill-through panel exists (data-testid="safety-home-drilldown")
 *   - it deep-links specific records with EntityLink kind="driver" AND kind="unit" (ids in the route)
 *   - the drill records are built from the ids the API returns (accidents driver_id/unit_id,
 *     events-log subject_driver_id/subject_unit_id)
 *   - NO link target is a bare `/safety` (must be a scoped surface or a specific-record deep-link)
 *
 * Layer 2 — Safety Officer alerts (apps/backend/src/safety-officer/role-views/safety-home.service.ts):
 *   - alert action_urls deep-link to the canonical detail routes /drivers/:id and /fleet/units/:id
 *     when a single subject is behind the alert
 *   - each alert carries the resolved subject_driver_id / subject_unit_id for reverse linkage
 *   - NO alert action_url is a bare `/safety`
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_SAFETY_KPI_DRILLTHROUGH_ROOT
  ? path.resolve(process.env.VERIFY_SAFETY_KPI_DRILLTHROUGH_ROOT)
  : process.cwd();

const LABEL = "verify:safety-kpi-drillthrough";
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

function requireAll(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      fail(`${relativePath}: missing ${check.label}`);
    }
  }
}

function forbid(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (pattern.test(content)) {
      fail(`${relativePath}: forbidden ${check.label}`);
    }
  }
}

// ── Layer 1 — FE Safety Home tab ────────────────────────────────────────────
const tabPath = "apps/frontend/src/pages/safety/tabs/SafetyHomeTab.tsx";
const tab = read(tabPath);
requireAll(tabPath, tab, [
  { pattern: /EntityLink/, label: "EntityLink drill-through primitive import/use" },
  { pattern: /data-testid="safety-home-drilldown"/, label: "records-needing-attention drill panel" },
  { pattern: /kind="driver"[^>]*id=\{/, label: "driver deep-link carrying a specific id" },
  { pattern: /kind="unit"[^>]*id=\{/, label: "unit deep-link carrying a specific id" },
  { pattern: /subject_driver_id/, label: "uses events-log subject_driver_id (existing id)" },
  { pattern: /subject_unit_id/, label: "uses events-log subject_unit_id (existing id)" },
  { pattern: /driver_id/, label: "uses accidents driver_id (existing id)" },
  { pattern: /unit_id/, label: "uses accidents unit_id (existing id)" },
  { pattern: /to="\/safety\/[a-z-]+"/, label: "KPI tile deep-links to a scoped safety surface" },
  // Company Violations KPI must drill to External Fines (company-violation filter lives there).
  {
    pattern: /label="Open Company Violations"[\s\S]*?to="\/safety\/external-fines"/,
    label: "Open Company Violations KPI links to /safety/external-fines",
  },
  // Drill panel honesty: accidents under "needing attention" must be open-only (not stale closed).
  {
    pattern: /status === ["']open["']/,
    label: "drill panel filters accidents to status === open",
  },
]);
// A KPI/drill link must never be a bare `/safety` (no trailing segment).
forbid(tabPath, tab, [
  { pattern: /to="\/safety"/, label: 'bare `to="/safety"` link (must be a scoped surface)' },
]);

// ── Layer 2 — Safety Officer alerts service ─────────────────────────────────
const servicePath = "apps/backend/src/safety-officer/role-views/safety-home.service.ts";
const service = read(servicePath);
requireAll(servicePath, service, [
  { pattern: /\/drivers\/\$\{/, label: "alert deep-link to /drivers/:id" },
  { pattern: /\/fleet\/units\/\$\{/, label: "alert deep-link to /fleet/units/:id" },
  { pattern: /subject_driver_id/, label: "alert carries subject_driver_id" },
  { pattern: /subject_unit_id/, label: "alert carries subject_unit_id" },
  { pattern: /count\(DISTINCT/, label: "sole-subject resolution (count DISTINCT)" },
  // #2614: cert-expiry alert must land on ExpiryDashboard, not DOT Compliance.
  {
    pattern: /alert_id:\s*"expiring_certs_30d"[\s\S]*?action_url:\s*"\/safety\/cert-expiry"/,
    label: "expiring_certs_30d action_url is /safety/cert-expiry",
  },
]);
// No alert may point at a bare `/safety` (the old workers-comp defect).
forbid(servicePath, service, [
  { pattern: /action_url:\s*"\/safety"/, label: 'bare `action_url: "/safety"`' },
]);

if (failures.length > 0) {
  console.error(`${LABEL} — FAILED`);
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log(`${LABEL} — OK`);
