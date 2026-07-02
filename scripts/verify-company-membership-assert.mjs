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
 * Nearly every per-module route file copy-pasted its OWN local `withCompanyScope`
 * / `withCompany` / `runReportQuery` tenant-scope wrapper and DROPPED the
 * `assertCompanyMembership` line. This guard fails if any of the hardened
 * tenant-scope wrapper files loses its membership assert again.
 *
 * COMPOSITION NOTE (pass 1 = #1784, pass 2 = this branch)
 * ------------------------------------------------------
 * #1784 (fix/cross-tenant-membership-assert) hardened the first ~22 forked wrappers
 * and introduced this guard. This branch (fix/cross-tenant-membership-sweep-2)
 * hardened 112 more local-wrapper forks. Both lists are UNIONED in
 * REQUIRED_MEMBERSHIP_ASSERT_FILES below (the two branches conflicted on this file +
 * package.json + ci.yml; resolved by taking the union of the file lists and
 * de-duping the identical package.json / ci.yml lines).
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
 * 300+ backend files set `app.operating_company_id`. The vast majority are safe:
 * (a) cron / worker / sync / outbox / webhook paths that derive the opco INTERNALLY
 * (iterating enabled companies or subscription rows) — no request principal to
 * assert; (b) driver-PWA / shipper-portal identity routes that derive the opco from
 * the authenticated principal's OWN record (drivers/portal users have NO
 * org.user_company_access rows — asserting there would 403 every driver); (c)
 * record-lookup routes whose opco comes from a row the caller already fetched; or
 * (d) `mdata.*` / `catalogs.*` reads whose RLS is IDENTITY-based (the GUC is
 * cosmetic there, not the tenant boundary). A guard that failed on every GUC set
 * would be all-noise or force touching ~140 out-of-scope files. This guard therefore
 * enforces the invariant precisely on the audited wrappers.
 * NOTE: three files hardened in this pass (drivers/messages.routes.ts,
 * safety/driver-scheduler.routes.ts, maintenance/pm-auto-engine.service.ts) are
 * MIXED — their office/request wrapper WAS hardened, but they also contain legit
 * driver-PWA record-derived / withLuciaBypass-cron GUC sets that must NOT assert, so
 * this simple-count guard cannot list them without false positives.
 * REMAINING request-reachable follow-up (pass 3): ~94 route files that inline
 * `set_config('app.operating_company_id', ...)` (no local wrapper) from a
 * request-supplied opco. Deferred from this sweep to avoid a fragile, wrong-principal
 * auto-rewrite; each needs per-site userId threading. Tracked as the cross-entity-leak
 * / entity-RLS audit follow-up (must land before USMCA go-live).
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
  // --- Pass 1 (#1784 fix/cross-tenant-membership-assert): audited high-risk
  //     tenant-scope wrappers hardened in the first sweep.
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
  // --- Pass 2 (fix/cross-tenant-membership-sweep-2): 109 local withCompany/
  //     withCompanyScope forks in per-module route files. Each defined its OWN tenant-scope
  //     wrapper that set the app.operating_company_id GUC from a request-supplied
  //     operating_company_id (UUID-validated only) with NO membership assert. All staff/office
  //     routes (no driver-PWA / shipper-portal identity routes).
  "audit/dispatch-overrides.routes.ts",
  "cash-advances/driver-hub-requests.routes.ts",
  "catalogs/maintenance/parts.routes.ts",
  "catalogs/maintenance/services.routes.ts",
  "compliance/csa.routes.ts",
  "compliance/drug-alcohol.routes.ts",
  "compliance/fmcsa-safer.routes.ts",
  "compliance/form-2290.routes.ts",
  "compliance/form-425c.routes.ts",
  "dispatch/loads.routes.ts",
  "driver-finance/pre-settlement.routes.ts",
  "driver-finance/settlements.routes.ts",
  "driver-finance/weekly-close.routes.ts",
  "drivers/document-alerts.routes.ts",
  "factoring/factoring.routes.ts",
  "identity/applicants.routes.ts",
  "insurance/claim.routes.ts",
  "insurance/coi-request.routes.ts",
  "insurance/dispersal.routes.ts",
  "insurance/lawsuit.routes.ts",
  "insurance/payment-schedule.routes.ts",
  "insurance/policy.routes.ts",
  "insurance/summary.routes.ts",
  "insurance/type-catalog.routes.ts",
  "integrations/plaid/link.routes.ts",
  "integrations/samsara/cap-12-tire-tread/routes.ts",
  "integrations/samsara/cap-13-brake-wear/routes.ts",
  "integrations/samsara/cap-14-cargo-sensors/routes.ts",
  "integrations/samsara/geofences/state-machine/routes.ts",
  "integrations/samsara/vehicle-driver-pairing/routes.ts",
  "integrity/anomaly-status.routes.ts",
  "integrity/driver-metrics.routes.ts",
  "legal/matters.routes.ts",
  "liabilities/liabilities.routes.ts",
  "maint/parts.routes.ts",
  "maint/pm.routes.ts",
  "maintenance/arriving-soon.routes.ts",
  "maintenance/compliance.routes.ts",
  "maintenance/dashboard-kpis.routes.ts",
  "maintenance/dashboard.routes.ts",
  "maintenance/defects.routes.ts",
  "maintenance/drivers.routes.ts",
  "maintenance/fault-auto-wo/auto-wo-drafts.routes.ts",
  "maintenance/fault-auto-wo/fault-history.routes.ts",
  "maintenance/fault-auto-wo/fault-rules.routes.ts",
  "maintenance/inspections.routes.ts",
  "maintenance/integrity.routes.ts",
  "maintenance/internal-labor.routes.ts",
  "maintenance/kpi.routes.ts",
  "maintenance/parts-inventory.routes.ts",
  "maintenance/parts-invoice-links.routes.ts",
  "maintenance/parts.routes.ts",
  "maintenance/pm-alerts.routes.ts",
  "maintenance/pm-schedule.routes.ts",
  "maintenance/pre-flight/routes.ts",
  "maintenance/reefer-hours.routes.ts",
  "maintenance/reports.routes.ts",
  "maintenance/road-service/tickets.routes.ts",
  "maintenance/service-timeline.service.ts",
  "maintenance/tires.routes.ts",
  "maintenance/triage.routes.ts",
  "maintenance/vehicles.routes.ts",
  "maintenance/vendors.routes.ts",
  "maintenance/warranty.routes.ts",
  "maintenance/work-orders.routes.ts",
  "mexico-ops/mx-permits.routes.ts",
  "mexico-ops/mx-tolls.routes.ts",
  "onboarding/state.routes.ts",
  "routes/safety/complaints.ts",
  "routes/safety/csa-scores.ts",
  "routes/safety/dot-inspections.ts",
  "routes/safety/hos-violations.ts",
  "routes/safety/integrity.ts",
  "safety/audit-425c.routes.ts",
  "safety/background-checks.routes.ts",
  "safety/company-violations.routes.ts",
  "safety/damage-continuity/continuity.routes.ts",
  "safety/damage-reports/photo-evidence.routes.ts",
  "safety/dot-inspection-events.routes.ts",
  "safety/driver-documents.routes.ts",
  "safety/driver-profile.routes.ts",
  "safety/driver-qualification.routes.ts",
  "safety/driver-scoring.routes.ts",
  "safety/driver-scoring/scoring.routes.ts",
  "safety/drug-pool.routes.ts",
  "safety/drug-program.routes.ts",
  "safety/dvir.routes.ts",
  "safety/eld-audit-trail/routes.ts",
  "safety/events/safety-events.routes.ts",
  "safety/expiry-tracking/routes.ts",
  "safety/fines.routes.ts",
  "safety/foundation-kpis.routes.ts",
  "safety/geofence-breach.routes.ts",
  "safety/hos.routes.ts",
  "safety/incidents.routes.ts",
  "safety/integrity-alerts.routes.ts",
  "safety/medical-cards.routes.ts",
  "safety/onboarding.routes.ts",
  "safety/permits.routes.ts",
  "safety/photo-comparison/routes.ts",
  "safety/position-history/position-history.routes.ts",
  "safety/reminders.routes.ts",
  "safety/reports/safety-reports.routes.ts",
  "safety/rtd.routes.ts",
  "safety/safety-v5.routes.ts",
  "safety/safety.routes.ts",
  "safety/settings.routes.ts",
  "safety/training-programs.routes.ts",
  "safety/training-records.routes.ts",
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
