// USERS-1 fixture/probe-account email pattern — SINGLE SOURCE OF TRUTH.
//
// Previously this regex was duplicated verbatim in two places and "kept in sync
// manually": identity/users.routes.ts (FIXTURE_USER_EMAIL_RE, blocks creating a
// fixture user in prod) and admin/admin-jobs.service.ts (PROBE_EMAIL_RE, drives the
// users.deactivate_probe_accounts job that DEACTIVATES matching prod accounts).
// A silent drift between the two could either leak a probe account past the create
// guard or deactivate a real user, so the pattern now lives here and both callers
// import it. Do NOT change the matching behavior without treating it as a prod
// deactivation-logic change.
//
// @example.* is an RFC-2606 reserved test domain (never a real user); m2-probe /
// m2-stop / verifyfix are the migration/CI probe-harness naming patterns that
// created the offending ACTIVE Owner accounts on prod.
export const FIXTURE_USER_EMAIL_RE = /@example\.(com|org|net)$|(^|[.+_-])(m2-probe|m2-stop|verifyfix)\b/i;

/**
 * Returns true when `email` matches the fixture/probe-account naming pattern
 * (RFC-2606 reserved test domain, or a migration/CI probe-harness name).
 */
export function isFixtureUserEmail(email: string): boolean {
  return FIXTURE_USER_EMAIL_RE.test(email);
}
