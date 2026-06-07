#!/usr/bin/env node
// GAP-87 — Audit Log Viewer CI guard
// Verifies: routes registered, RBAC Owner-only, no write paths.

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function readFile(rel) {
  const abs = resolve(ROOT, rel);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, "utf8");
}

console.log("\nGAP-87 Audit Log Viewer — CI guard\n");

// 1. Backend viewer service exists
{
  const svc = readFile("apps/backend/src/audit/viewer/service.ts");
  check("viewer service.ts exists", svc !== null);
  check("queryAuditEvents exported", svc?.includes("export async function queryAuditEvents") ?? false);
  check("getEventDetail exported", svc?.includes("export async function getEventDetail") ?? false);
  check("No write statements in service", !svc?.match(/INSERT|UPDATE|DELETE/i) ?? false, "service must be read-only");
}

// 2. Backend viewer routes exist + Owner-only guard
{
  const routes = readFile("apps/backend/src/audit/viewer/routes.ts");
  check("viewer routes.ts exists", routes !== null);
  check("GET /api/audit/viewer/events registered", routes?.includes('"/api/audit/viewer/events"') ?? false);
  check("GET /api/audit/viewer/events/:uuid registered", routes?.includes('"/api/audit/viewer/events/:uuid"') ?? false);
  check("ownerOnly guard present", routes?.includes("ownerOnly") ?? false);
  check("No POST/PUT/DELETE/PATCH routes", !routes?.match(/app\.(post|put|delete|patch)\s*\(/i) ?? false, "must be read-only");
}

// 3. Routes registered in index.ts
{
  const idx = readFile("apps/backend/src/index.ts");
  check("registerAuditViewerRoutes imported in index.ts", idx?.includes("registerAuditViewerRoutes") ?? false);
}

// 4. Frontend viewer page exists
{
  const page = readFile("apps/frontend/src/pages/admin/audit-log/AuditLogViewer.tsx");
  check("AuditLogViewer.tsx exists", page !== null);
  check("listAuditViewerEvents imported", page?.includes("listAuditViewerEvents") ?? false);
  check("AuditEventCard imported", page?.includes("AuditEventCard") ?? false);
  check("SuperAdminNav imported", page?.includes("SuperAdminNav") ?? false);
}

// 5. AuditEventCard component exists
{
  const card = readFile("apps/frontend/src/components/audit/AuditEventCard.tsx");
  check("AuditEventCard.tsx exists", card !== null);
  check("AuditEventCard exported", card?.includes("export function AuditEventCard") ?? false);
}

// 6. SuperAdminNav component exists with Audit Log link
{
  const nav = readFile("apps/frontend/src/components/admin/SuperAdminNav.tsx");
  check("SuperAdminNav.tsx exists", nav !== null);
  check("Audit Log link present in SuperAdminNav", nav?.includes("/admin/audit-log") ?? false);
}

// 7. Sidebar config includes audit-log for Owner/SuperAdmin
{
  const sidebar = readFile("apps/frontend/src/components/layout/sidebar-config.ts");
  check("sidebar-config includes audit-log link", sidebar?.includes('"/admin/audit-log"') ?? false);
}

// 8. Frontend route wired in manifest.tsx
{
  const manifest = readFile("apps/frontend/src/routes/manifest.tsx");
  check("/admin/audit-log route in manifest.tsx", manifest?.includes('"/admin/audit-log"') ?? false);
  check("AuditLogViewer imported in manifest", manifest?.includes("AuditLogViewer") ?? false);
  check("Route uses OwnerSuperAdminRoute guard", (() => {
    const idx = manifest?.indexOf('"/admin/audit-log"') ?? -1;
    if (idx < 0) return false;
    const ctx = manifest?.slice(idx - 200, idx + 300) ?? "";
    return ctx.includes("OwnerSuperAdminRoute");
  })());
}

// 9. Frontend API client has viewer functions
{
  const api = readFile("apps/frontend/src/api/audit.ts");
  check("listAuditViewerEvents exported from api/audit.ts", api?.includes("export async function listAuditViewerEvents") ?? false);
  check("getAuditViewerEventDetail exported from api/audit.ts", api?.includes("export async function getAuditViewerEventDetail") ?? false);
  check("No listAuditRowChanges (wrong data source removed)", !api?.includes("listAuditRowChanges") ?? false);
}

// 10. No write paths in frontend page
{
  const page = readFile("apps/frontend/src/pages/admin/audit-log/AuditLogViewer.tsx");
  check("No useMutation in viewer page (read-only)", !page?.includes("useMutation") ?? false);
  check("No POST/PUT/DELETE calls in viewer page", !page?.match(/method.*['"](POST|PUT|DELETE|PATCH)['"]/i) ?? false);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
