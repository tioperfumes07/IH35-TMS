#!/usr/bin/env node
/**
 * GAP-25 CI Guard — Active Driver Set
 *
 * Verifies:
 *  1. Migration file exists and contains required DDL
 *  2. recompute.service.ts exports expected function
 *  3. query.service.ts exports expected function
 *  4. routes.ts registers both API routes
 *  5. Worker exists and exports initializeActiveDriverSetRecomputeWorker
 *  6. Worker is wired into apps/backend/src/index.ts (import + call)
 *  7. SafetyHome.tsx uses the cached query path (fetch call to /api/integrations/samsara/active-drivers)
 */

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

// 1. Migration
const migration = read("db/migrations/202606080001_active_driver_set_cache.sql");
contains("db/migrations/202606080001_active_driver_set_cache.sql", migration, [
  { pattern: /active_driver_set_cache/, label: "table name" },
  { pattern: /operating_company_id/, label: "operating_company_id column" },
  { pattern: /threshold_days/, label: "threshold_days column" },
  { pattern: /active_driver_uuids/, label: "active_driver_uuids column" },
  { pattern: /idx_adset_snapshot/, label: "snapshot index" },
  { pattern: /ROW LEVEL SECURITY/, label: "RLS enabled" },
  { pattern: /ih35_app/, label: "ih35_app role grant" },
  { pattern: /GRANT USAGE ON SCHEMA integrations/, label: "schema usage grant" },
]);

// 2. Recompute service
const recomputeService = read(
  "apps/backend/src/integrations/samsara/active-driver-set/recompute.service.ts"
);
contains(
  "apps/backend/src/integrations/samsara/active-driver-set/recompute.service.ts",
  recomputeService,
  [
    { pattern: /export async function recomputeActiveDriverSet/, label: "recomputeActiveDriverSet export" },
    { pattern: /MAX_SNAPSHOTS_PER_OCI/, label: "MAX_SNAPSHOTS_PER_OCI constant" },
    { pattern: /DELETE FROM integrations\.active_driver_set_cache/, label: "retention prune query" },
    { pattern: /INSERT INTO integrations\.active_driver_set_cache/, label: "snapshot insert" },
  ]
);

// 3. Query service
const queryService = read(
  "apps/backend/src/integrations/samsara/active-driver-set/query.service.ts"
);
contains(
  "apps/backend/src/integrations/samsara/active-driver-set/query.service.ts",
  queryService,
  [
    { pattern: /export async function getActiveDrivers/, label: "getActiveDrivers export" },
    { pattern: /cache_hit/, label: "cache_hit flag" },
    { pattern: /recomputeActiveDriverSet/, label: "stale fallback to recompute" },
  ]
);

// 4. Routes
const routes = read(
  "apps/backend/src/integrations/samsara/active-driver-set/routes.ts"
);
contains(
  "apps/backend/src/integrations/samsara/active-driver-set/routes.ts",
  routes,
  [
    { pattern: /\/api\/integrations\/samsara\/active-drivers"/, label: "GET active-drivers route" },
    { pattern: /\/api\/integrations\/samsara\/active-drivers\/recompute/, label: "POST recompute route" },
    { pattern: /export async function registerActiveDriverSetRoutes/, label: "registerActiveDriverSetRoutes export" },
  ]
);

// 5. Worker
const worker = read("apps/backend/src/jobs/active-driver-set-recompute.ts");
contains("apps/backend/src/jobs/active-driver-set-recompute.ts", worker, [
  { pattern: /export function initializeActiveDriverSetRecomputeWorker/, label: "worker export" },
  { pattern: /\*\/15 \* \* \* \*/, label: "15-min cron schedule" },
  { pattern: /recomputeActiveDriverSet/, label: "calls recomputeActiveDriverSet" },
]);

// 6. Index.ts wiring
const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerActiveDriverSetRoutes/, label: "route import+call in index.ts" },
  { pattern: /initializeActiveDriverSetRecomputeWorker/, label: "worker import+call in index.ts" },
]);

// 7. Safety Home uses cached query path
// LIVE-FILE CORRECTION (2026-08-20, CC-3): this check was reading
// `pages/safety/SafetyHome.tsx`, an explicitly `@archived` v5 shell that carries "no active
// manifest imports" in its own file header — the same dead-file-inventory class PR #10009
// already fixed for verify-canonical-load-nav. The real live Safety home is `SafetyHomeTab.tsx`
// at /safety/home (SafetyLayout + SAFETY_TABS_CONFIG). Retargeted; the wiring itself was
// genuinely missing on the live file too (grep-confirmed zero repo-wide references before this
// fix), so this was a real gap, not just a stale guard target.
// The URL lives in the shared apps/frontend/src/api/safety.ts client (same pattern as every
// other query in this file — pages call a named api/*.ts function, never inline a raw fetch
// URL); the page's own file is checked for actually consuming it (state + selector + freshness).
const safetyApiClient = read("apps/frontend/src/api/safety.ts");
contains("apps/frontend/src/api/safety.ts", safetyApiClient, [
  { pattern: /\/api\/integrations\/samsara\/active-drivers/, label: "getActiveDriverSet calls the cached active-drivers API" },
  { pattern: /ACTIVITY_WINDOW_OPTIONS/, label: "ACTIVITY_WINDOW_OPTIONS defined" },
  { pattern: /cache_hit/, label: "ActiveDriverSetResult carries cache_hit" },
]);
const safetyHomeTab = read("apps/frontend/src/pages/safety/tabs/SafetyHomeTab.tsx");
contains("apps/frontend/src/pages/safety/tabs/SafetyHomeTab.tsx", safetyHomeTab, [
  { pattern: /getActiveDriverSet\(/, label: "SafetyHomeTab calls getActiveDriverSet" },
  { pattern: /activeDriverWindow/, label: "active-driver-set window state" },
  { pattern: /ACTIVITY_WINDOW_OPTIONS/, label: "SafetyHomeTab renders the ACTIVITY_WINDOW_OPTIONS selector" },
  { pattern: /cache_hit/, label: "freshness indicator renders cache_hit" },
]);

// Report
if (failures.length > 0) {
  console.error("\n[verify-active-driver-set] FAILED:\n");
  for (const f of failures) {
    console.error(`  ✗ ${f}`);
  }
  process.exit(1);
} else {
  console.log("[verify-active-driver-set] All checks passed ✓");
  process.exit(0);
}
