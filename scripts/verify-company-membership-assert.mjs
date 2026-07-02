#!/usr/bin/env node
/**
 * verify-company-membership-assert
 *
 * Cross-tenant authorization guard (USMCA-launch blocker).
 *
 * ROOT CAUSE THIS GUARD LOCKS IN
 * ------------------------------
 * The canonical tenant-scope wrapper `apps/backend/src/accounting/shared.ts`
 * calls `assertCompanyMembership(userId, operatingCompanyId)` BEFORE it sets the
 * `app.operating_company_id` GUC (via `set_config` / `SET LOCAL`). That assert is
 * what proves the authenticated user actually belongs to the company they passed
 * in the request — WITHOUT it, an authed user can set the tenant GUC to ANOTHER
 * company's id (it is only UUID-validated) and read/write across tenants. On the
 * `withLuciaBypass` (RLS fully OFF) report path the GUC set is the ONLY tenant
 * boundary, so the assert there is load-bearing, not defense-in-depth.
 *
 * ~13 modules copy-pasted `withCompanyScope` / `withCompany` / `runReportQuery`
 * and DROPPED the `assertCompanyMembership` line. This guard fails if any of the
 * hardened tenant-scope wrapper files loses its membership assert again.
 *
 * WHAT THIS GUARD CHECKS
 * ----------------------
 * For each file in REQUIRED_MEMBERSHIP_ASSERT_FILES (the audited high-risk
 * tenant-scope wrappers + the two canonical wrappers), the number of
 * `assertCompanyMembership(` CALLS must be >= the number of places that set
 * `app.operating_company_id` from a caller-derived value. Removing any single
 * assert makes calls < GUC-sets and turns this red.
 *
 * SCOPE / KNOWN FOLLOW-UP (intentionally NOT a blanket scan)
 * ----------------------------------------------------------
 * 300+ backend files set `app.operating_company_id`. The vast majority are safe
 * because (a) they read/write `mdata.*` / `catalogs.*` tables whose RLS is
 * IDENTITY-based (the GUC is cosmetic there, not the tenant boundary), or (b)
 * they are cron / worker / sync paths that derive the opco INTERNALLY (iterating
 * enabled companies or subscription rows), not from a request. A guard that
 * failed on every GUC set would be all-noise or force touching ~140 out-of-scope
 * files. This guard therefore enforces the invariant precisely on the audited
 * wrappers. Extending coverage to EVERY forked `withCompany*` wrapper and every
 * `withLuciaBypass` GUC-setter is tracked as the cross-entity-leak / entity-RLS
 * audit follow-up (must land before USMCA go-live).
 *
 * Static guard — no DB required. Runs in CI on every push.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const BACKEND_SRC = join(ROOT, "apps/backend/src");

// Tenant-scope wrapper files hardened by the cross-tenant authz fix, plus the two
// CANONICAL wrappers (accounting/shared.ts, banking/shared.ts) so they can never
// silently lose their assert either. Paths are relative to apps/backend/src.
const REQUIRED_MEMBERSHIP_ASSERT_FILES = [
  // Canonical reference wrappers (already correct — kept here to prevent regression)
  "accounting/shared.ts",
  "banking/shared.ts",
  // Reports
  "reports/shared.ts",
  "reports/queries/shared.ts", // withLuciaBypass — RLS OFF, assert is the ONLY boundary
  // Cash advances
  "cash-advances/cash-advances.routes.ts",
  // Driver finance
  "driver-finance/deductions.routes.ts",
  "driver-finance/debt.routes.ts",
  "driver-finance/settlements-mvp.routes.ts",
  // Catalogs (catalogs.* is FORCE-RLS on operating_company_id — GUC is the boundary)
  "catalogs/dispatch/shared.ts",
  "catalogs/driver/shared.ts",
  "catalogs/fuel/shared.ts",
  "catalogs/safety/shared.ts",
  "catalogs/maintenance/shared.ts",
  "catalogs/accounting/factory.ts",
  // Payroll integration
  "payroll-integration/aggregate.routes.ts",
  // Fuel
  "fuel/planner.routes.ts",
  "fuel/loves-upload.routes.ts",
  // IFTA
  "ifta/ifta-quarterly-preparer.routes.ts",
  // Lists
  "lists/lists-hub.routes.ts",
  "lists/lists-counts.routes.ts",
  "lists/names-master.routes.ts",
  // Profitability (analytics.load_fact is GUC-scoped)
  "profitability/profitability.routes.ts",
  // Telematics
  "telematics/dashcam-on-demand.routes.ts",
  // Safety officer role home
  "safety-officer/role-views/routes.ts",
];

// Matches a place that SETS the tenant GUC from a caller-derived value.
const GUC_SET_RE =
  /set_config\(\s*['"`]app\.operating_company_id['"`]|SET\s+LOCAL\s+app\.operating_company_id/gi;
// Matches an actual assertCompanyMembership CALL (not the bare import specifier).
const ASSERT_CALL_RE = /assertCompanyMembership\s*\(/g;

const failures = [];

for (const rel of REQUIRED_MEMBERSHIP_ASSERT_FILES) {
  const full = join(BACKEND_SRC, rel);
  if (!existsSync(full)) {
    failures.push(`${rel}: REQUIRED tenant-scope wrapper file is missing (was it moved/renamed? update this guard's list)`);
    continue;
  }
  const src = readFileSync(full, "utf8");
  const gucSets = (src.match(GUC_SET_RE) || []).length;
  const assertCalls = (src.match(ASSERT_CALL_RE) || []).length;

  if (gucSets === 0) {
    failures.push(
      `${rel}: expected to set app.operating_company_id but found none — the wrapper shape changed; re-verify the membership assert is still paired with the GUC set and update this guard.`
    );
    continue;
  }
  if (assertCalls < gucSets) {
    failures.push(
      `${rel}: sets app.operating_company_id ${gucSets}x but only ${assertCalls} assertCompanyMembership() call(s) — every caller-derived tenant-GUC set MUST be preceded by assertCompanyMembership(userId, operatingCompanyId) (cross-tenant authz).`
    );
  }
}

if (failures.length > 0) {
  console.error("verify-company-membership-assert FAILED:");
  for (const f of [...new Set(failures)].sort()) console.error(`  ✗ ${f}`);
  console.error(
    "\nCross-tenant authorization violation: a tenant-scope wrapper set app.operating_company_id\n" +
      "from a caller-supplied operating_company_id without first calling assertCompanyMembership().\n" +
      "Add `await assertCompanyMembership(userId, operatingCompanyId)` immediately before the GUC set,\n" +
      "mirroring apps/backend/src/accounting/shared.ts. See the guard header for scope + follow-up."
  );
  process.exit(1);
}

console.log(
  `verify-company-membership-assert OK — ${REQUIRED_MEMBERSHIP_ASSERT_FILES.length} tenant-scope wrapper files scanned, ` +
    `every caller-derived app.operating_company_id GUC set is paired with assertCompanyMembership().`
);
