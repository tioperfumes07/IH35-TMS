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

// 7. SafetyHome.tsx uses cached query path
const safetyHome = read("apps/frontend/src/pages/safety/SafetyHome.tsx");
contains("apps/frontend/src/pages/safety/SafetyHome.tsx", safetyHome, [
  { pattern: /\/api\/integrations\/samsara\/active-drivers/, label: "SafetyHome uses cached active-drivers API" },
  { pattern: /activityWindow/, label: "activityWindow state" },
  { pattern: /ACTIVITY_WINDOW_OPTIONS/, label: "ACTIVITY_WINDOW_OPTIONS defined" },
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
