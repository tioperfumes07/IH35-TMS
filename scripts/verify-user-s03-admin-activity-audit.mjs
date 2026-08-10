#!/usr/bin/env node
/**
 * USER-S03 — /admin/activity and /admin/audit-log Owner/SuperAdmin reachability.
 * Static ratchet (no verify-steps / CLAIMED — Rule 37; same pattern as verify-user-s02*).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-user-s03-admin-activity-audit";
const SELFTEST = process.argv.includes("--selftest");
const SIDEBAR = "apps/frontend/src/components/layout/sidebar-config.ts";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const ACTIVITY = "apps/frontend/src/pages/admin/ActivityLogPage.tsx";
const AUDIT = "apps/frontend/src/pages/admin/audit-log/AuditLogViewer.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function extractUsersCase(src) {
  const marker = 'case "users"';
  const start = src.indexOf(marker);
  if (start < 0) return "";
  const nextCase = src.indexOf("case \"", start + marker.length);
  return nextCase < 0 ? src.slice(start) : src.slice(start, nextCase);
}

function extractRouteBlock(src, routePath) {
  const needle = `path="${routePath}"`;
  const start = src.indexOf(needle);
  if (start < 0) return "";
  const routeOpen = src.lastIndexOf("<Route", start);
  const from = routeOpen >= 0 ? routeOpen : start;
  const end = src.indexOf("</Route>", from);
  return end < 0 ? src.slice(from, from + 400) : src.slice(from, end + "</Route>".length);
}

function assertLive() {
  const problems = [];
  const sidebar = read(SIDEBAR);
  const manifest = read(MANIFEST);
  const activity = read(ACTIVITY);
  const audit = read(AUDIT);
  const usersCase = extractUsersCase(sidebar);

  if (!usersCase) problems.push('sidebar missing case "users"');
  if (!usersCase.includes('role === "Owner" || role === "SuperAdmin"')) {
    problems.push("users flyout missing Owner||SuperAdmin gate for admin logs");
  }
  if (!usersCase.includes('{ label: "Activity log", to: "/admin/activity" }')) {
    problems.push("users flyout missing Activity log → /admin/activity");
  }
  if (!usersCase.includes('{ label: "Audit log", to: "/admin/audit-log" }')) {
    problems.push("users flyout missing Audit log → /admin/audit-log");
  }

  if (!manifest.includes("function OwnerSuperAdminRoute")) {
    problems.push("OwnerSuperAdminRoute helper missing");
  }
  const gateIdx = manifest.indexOf("function OwnerSuperAdminRoute");
  const gateSlice = gateIdx >= 0 ? manifest.slice(gateIdx, gateIdx + 700) : "";
  if (!gateSlice.includes('role !== "Owner"') || !gateSlice.includes('role !== "SuperAdmin"')) {
    problems.push("OwnerSuperAdminRoute must allow only Owner and SuperAdmin");
  }

  const activityRoute = extractRouteBlock(manifest, "/admin/activity");
  if (!activityRoute) problems.push('manifest missing path="/admin/activity"');
  if (activityRoute && !activityRoute.includes("OwnerSuperAdminRoute")) {
    problems.push("/admin/activity not wrapped in OwnerSuperAdminRoute");
  }
  if (activityRoute && !activityRoute.includes("<ActivityLogPage")) {
    problems.push("/admin/activity must mount ActivityLogPage");
  }

  const auditRoute = extractRouteBlock(manifest, "/admin/audit-log");
  if (!auditRoute) problems.push('manifest missing path="/admin/audit-log"');
  if (auditRoute && !auditRoute.includes("OwnerSuperAdminRoute")) {
    problems.push("/admin/audit-log not wrapped in OwnerSuperAdminRoute");
  }
  if (auditRoute && !auditRoute.includes("<AuditLogViewer")) {
    problems.push("/admin/audit-log must mount AuditLogViewer");
  }

  if (!activity.includes("fetchAdminActivity")) {
    problems.push("ActivityLogPage must call fetchAdminActivity");
  }
  if (/ComingSoon|coming soon/i.test(activity)) {
    problems.push("ActivityLogPage must not be ComingSoon");
  }
  if (!audit.includes("listAuditViewerEvents")) {
    problems.push("AuditLogViewer must call listAuditViewerEvents");
  }
  if (/ComingSoon|coming soon/i.test(audit)) {
    problems.push("AuditLogViewer must not be ComingSoon");
  }

  return problems;
}

if (SELFTEST) {
  const live = assertLive();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  const sidebarPath = path.join(ROOT, SIDEBAR);
  const orig = fs.readFileSync(sidebarPath, "utf8");
  fs.writeFileSync(
    sidebarPath,
    orig.replace('{ label: "Activity log", to: "/admin/activity" }', '{ label: "Activity log", to: "/admin/activity-REMOVED" }')
  );
  try {
    if (!assertLive().length) {
      console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
      process.exit(1);
    }
  } finally {
    fs.writeFileSync(sidebarPath, orig);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertLive();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
