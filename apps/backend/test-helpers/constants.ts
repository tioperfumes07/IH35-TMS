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

/**
 * Session-level pg_advisory_lock key shared by settlement suites that mutate GLOBAL
 * `catalogs.account_role_bindings` (UNIQUE(role_key)):
 *   settlement-bill-payment-posting / settlement-gl-posting / settlement-payrun-close.
 * Hold for the full save → bind → post/tests → restore lifespan; restore must fail loud.
 * See test-helpers/global-account-role-bindings-lock.ts.
 */
export const GLOBAL_ACCOUNT_ROLE_BINDINGS_TEST_LOCK_KEY = "922337203685477002";

/**
 * Shared ENCRYPTION_KEY default for every `.db.test.ts` that seeds a fake integrations.qbo_connections
 * row so createJournalEntry's unconditional enqueueSyncJob->getValidAccessToken can resolve a connection
 * (the JE push flag itself stays OFF — push is gated separately, at drain/immediate-push time). MUST be
 * the SAME literal across every file that adopts this pattern: vitest's `pool: "forks"` can reuse one
 * child process across multiple test files (files aren't always process-isolated), so a per-file
 * `process.env.ENCRYPTION_KEY ??= "<file-specific literal>"` default is a landmine — whichever file's
 * module loads first in a shared fork "wins" the value for the whole process, and
 * getActiveConnectionByCompany (qbo-oauth.service.ts) has no realm_id filter (picks the single latest
 * `authorized_at` row for the company), so a SECOND file's connection row can get decrypted with a
 * DIFFERENT process-wide key than it was encrypted with -> AES-GCM auth-tag failure ("Unsupported state
 * or unable to authenticate data"). Import this constant (never a local literal) in every such file.
 */
export const TEST_ENCRYPTION_KEY = "test-only-encryption-key-shared-db-test-qbo-connection";
