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
 *   - accidents are filtered by accident_at recent window (30d) — NOT a phantom status column
 *   - events-log keeps its real status=open filter (API supports it)
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
  // Company Violations KPI must drill to External Fines WITH the company-violation filter (C-06).
  {
    pattern:
      /label="Open Company Violations"[\s\S]*?to="\/safety\/external-fines\?record_type=company-violation"/,
    label: "Open Company Violations KPI links to /safety/external-fines?record_type=company-violation",
  },
  // Drivers with Open Fines must match SafetyKpiRow (internal-fines), not external-fines default.
  {
    pattern: /label="Drivers with Open Fines"[\s\S]*?to="\/safety\/internal-fines"/,
    label: "Drivers with Open Fines KPI links to /safety/internal-fines",
  },
  // Events-log DOES support status — open filter must remain.
  {
    pattern: /listSafetyEventLog\([^)]*status:\s*["']open["']/,
    label: "events-log drill query filters status open (API supports it)",
  },
  // Accidents have NO status column on prod — filter by real accident_at recent window.
  {
    pattern: /isRecentAccident\s*\(\s*row\.accident_at\s*\)/,
    label: "accidents filtered via isRecentAccident(row.accident_at)",
  },
  {
    pattern: /RECENT_ACCIDENT_WINDOW_MS\s*=\s*30\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/,
    label: "30-day recent-accident window constant",
  },
  {
    pattern: /[Rr]ecent accidents \(30d\)/,
    label: "panel title/subtitle discloses recent accidents (30d)",
  },
  // C-13 / LST-F104 — accident drill Open record must deep-link (not detailTo: null).
  {
    pattern: /accident_id=\$\{/,
    label: "accident drill detailTo uses ?accident_id= deeplink",
  },
  // C-13 / LST-F106 — event drill Open record must deep-link to safety-events.
  {
    pattern: /event_id=\$\{/,
    label: "event drill detailTo uses ?event_id= deeplink",
  },
  {
    pattern: /\/safety\/safety-events\?event_id=/,
    label: "event drill targets /safety/safety-events?event_id=",
  },
  {
    pattern: /data-testid="safety-home-retry"/,
    label: "SAFETY-F6437 Retry control when dashboard queries fail",
  },
  {
    pattern: /retryFailedDashboardQueries/,
    label: "Retry refetches failed Safety home queries",
  },
  {
    pattern: /if \(query\.isError\) void query\.refetch\(\)/,
    label: "Retry only refetches failed queries",
  },
]);
// A KPI/drill link must never be a bare `/safety` (no trailing segment).
// Accidents must never read a phantom row.status (defaults to "open" = no-op fake filter).
// C-13: accident map must not leave detailTo: null (dead Open record).
forbid(tabPath, tab, [
  { pattern: /to="\/safety"/, label: 'bare `to="/safety"` link (must be a scoped surface)' },
  {
    pattern: /row\.status/,
    label: "phantom row.status read on accidents (column does not exist on prod)",
  },
  {
    pattern: /\/\/ No per-id accident detail route exists/,
    label: "stale comment claiming no accident deeplink (C-13 closed)",
  },
  {
    pattern: /detailTo:\s*null,\s*\n\s*\}\)\);/,
    label: "event drill still leaves detailTo: null (dead Open record)",
  },
]);

// LST-F106 — SafetyEventsPage must honor ?event_id= for Home drill reverse hop.
const eventsPagePath = "apps/frontend/src/pages/safety/SafetyEventsPage.tsx";
const eventsPage = read(eventsPagePath);
requireAll(eventsPagePath, eventsPage, [
  { pattern: /searchParams\.get\("event_id"\)/, label: "reads ?event_id= from URL" },
  { pattern: /setSelectedEventId\(eventIdParam\)/, label: "opens detail from event_id param" },
]);


// C-06 — External Fines honors ?record_type= so Home company-violations tile is not a facade.
const finesPath = "apps/frontend/src/pages/safety/FinesPage.tsx";
const fines = read(finesPath);
requireAll(finesPath, fines, [
  { pattern: /searchParams\.get\("record_type"\)/, label: "reads ?record_type= from URL" },
  { pattern: /company-violation/, label: "recognizes company-violation record type" },
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
