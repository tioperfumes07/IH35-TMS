/** SQL fragment: hide archived test/seed rows from human-facing listings. */
export const EXCLUDE_ARCHIVED_DRIVERS_SQL = "archived_at IS NULL";

export const EXCLUDE_ARCHIVED_QBO_CUSTOMERS_SQL = "qc.archived_at IS NULL";

export const EXCLUDE_ARCHIVED_MDATA_CUSTOMERS_SQL = "archived_at IS NULL";

export const EXCLUDE_ARCHIVED_MDATA_CUSTOMERS_ALIAS_SQL = "c.archived_at IS NULL";

export const EXCLUDE_ARCHIVED_IDENTITY_USERS_SQL = "u.archived_at IS NULL";

/** Patterns mirrored by migration 0320 and CI guard. */
export const TEST_SEED_DISPLAY_PATTERN = /^(TEST-|seed-)/i;
export const TEST_SEED_EMAIL_PATTERN = /(@seed\.invalid$|^seed-test-)/i;

export function isTestSeedDisplayName(value: string | null | undefined): boolean {
  if (!value) return false;
  return TEST_SEED_DISPLAY_PATTERN.test(value.trim());
}

export function isTestSeedEmail(value: string | null | undefined): boolean {
  if (!value) return false;
  return TEST_SEED_EMAIL_PATTERN.test(value.trim().toLowerCase());
}
