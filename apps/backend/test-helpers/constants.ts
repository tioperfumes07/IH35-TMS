/** Stable Owner identity used by integration tests (must exist with org.user_company_access). */
export const TEST_OWNER_USER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
export const TEST_OWNER_EMAIL = "integration.owner@test.invalid";
export const TEST_OWNER_GOOGLE_ID = "integration-google-user-id";

/**
 * Session-level pg_advisory_lock key shared by the bank-feed / bank-driver-advance `.db.test.ts` family.
 * Those files run in PARALLEL forks against the SAME shared TRANSP company and both mutate the SINGLETON
 * active `cash_advance` mapping in accounting.expense_category_account_map (unique partial index on
 * operating_company_id, category_kind, category_code WHERE is_active=true). Acquiring this lock in each
 * file's beforeAll (released on db.end() in afterAll) serializes their lifespans so one file's mapping
 * writes/teardown can never leak into the other's assertions. Distinct from the transaction lock used by
 * ensureIntegrationPrerequisites (…477000). Isolation only — no financial/GL behavior is affected.
 */
export const CASH_ADVANCE_MAP_TEST_LOCK_KEY = "922337203685477001";
