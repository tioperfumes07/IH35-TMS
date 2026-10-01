/**
 * The one system actor for background jobs. identity.users has exactly this id
 * (00000000-0000-4000-8000-000000000001) and it passes assertCompanyMembership; the look-alike
 * all-zero-version id (…-0000-0000-…-0001, no "4000-8000") does NOT exist, and the retry-held-expense-postings cron
 * failed every run since 2026-09-29 with forbidden_company_membership because it defaulted to it
 * (measured 2026-10-01: last_successful_run_at null, 11 fuel drafts never posted).
 * SYSTEM_ACTOR_USER_ID in the environment still wins when set.
 */
export const SYSTEM_ACTOR_USER_ID: string =
  process.env.SYSTEM_ACTOR_USER_ID?.trim() || "00000000-0000-4000-8000-000000000001";
