#!/usr/bin/env node
/**
 * verify-a6-audit-universal-view.mjs
 * Assert A6: spine read endpoint + RLS + pagination + no writes + UI wired.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { console.error(`FAIL: missing file: ${rel}`); process.exit(1); }
  return fs.readFileSync(abs, "utf8");
}
let failed = false;
function fail(msg) { console.error(`[verify-a6] FAIL: ${msg}`); failed = true; }
function pass(msg) { console.log(`[verify-a6] PASS: ${msg}`); }

const routeSrc = read("apps/backend/src/audit/spine-events.routes.ts");
pass("spine-events.routes.ts exists");

if (!routeSrc.includes("events.event_log")) fail("spine-events.routes.ts does not query events.event_log");
else pass("spine-events.routes.ts queries events.event_log");

// Accept legacy `SET LOCAL app.operating_company_id` OR the SQLi-hardened parameterized
// `set_config('app.operating_company_id', $1, true)` form.
if (!/(?:SET LOCAL app\.operating_company_id|set_config\(\s*['"]app\.operating_company_id['"])/.test(routeSrc)) fail("spine-events.routes.ts missing RLS tenant scope");
else pass("spine-events.routes.ts sets RLS operating_company_id");

if (!routeSrc.includes("LIMIT")) fail("spine-events.routes.ts missing LIMIT");
else pass("spine-events.routes.ts enforces LIMIT pagination");

if (!routeSrc.includes("OFFSET")) fail("spine-events.routes.ts missing OFFSET");
else pass("spine-events.routes.ts has OFFSET");

if (/\b(INSERT|UPDATE|DELETE)\s+/i.test(routeSrc)) fail("spine-events.routes.ts contains write SQL — must be read-only");
else pass("spine-events.routes.ts is read-only");

const indexSrc = read("apps/backend/src/index.ts");
if (!indexSrc.includes("registerSpineEventsRoutes")) fail("index.ts missing registerSpineEventsRoutes");
else pass("index.ts registers registerSpineEventsRoutes");

if (!indexSrc.includes("registerAuditViewerRoutes")) fail("index.ts missing registerAuditViewerRoutes");
else pass("index.ts registers registerAuditViewerRoutes");

const apiSrc = read("apps/frontend/src/api/audit.ts");
if (!apiSrc.includes("listSpineEvents")) fail("api/audit.ts missing listSpineEvents");
else pass("api/audit.ts has listSpineEvents");

if (!apiSrc.includes("/api/v1/audit/spine-events")) fail("api/audit.ts missing /api/v1/audit/spine-events");
else pass("api/audit.ts calls /api/v1/audit/spine-events");

const pageSrc = read("apps/frontend/src/pages/audit/AuditTrailPage.tsx");
if (!pageSrc.includes("listSpineEvents")) fail("AuditTrailPage.tsx missing listSpineEvents");
else pass("AuditTrailPage.tsx calls listSpineEvents");

if (!pageSrc.includes("downloadCSV")) fail("AuditTrailPage.tsx missing CSV export");
else pass("AuditTrailPage.tsx has CSV export");

const manifestSrc = read("apps/frontend/src/routes/manifest.tsx");
if (!manifestSrc.includes("/audit/trail")) fail("manifest.tsx missing /audit/trail route");
else pass("manifest.tsx has /audit/trail route");

if (!manifestSrc.includes("AuditTrailPage")) fail("manifest.tsx missing AuditTrailPage import");
else pass("manifest.tsx imports AuditTrailPage");

const sidebarSrc = read("apps/frontend/src/components/layout/sidebar-config.ts");
if (!sidebarSrc.includes("/audit/trail")) fail("sidebar-config.ts missing /audit/trail link");
else pass("sidebar-config.ts has /audit/trail link");

if (failed) { console.error("\n[verify-a6] FAILED"); process.exit(1); }
console.log("\n[verify-a6] ALL CHECKS PASSED");
