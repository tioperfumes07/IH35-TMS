/**
 * TIEOUT auto_check helpers. Empty is never PASS (sql-runner R2).
 * Missing DATABASE_URL → exit 2 (UNVERIFIED), never 0.
 * Never filter on is_sample_data / is_duplicate / header-only FKs to decide "real".
 */
export function unverified(msg) {
  console.error(`TIEOUT UNVERIFIED: ${msg}`);
  process.exit(2);
}

export function fail(msg) {
  console.error(`TIEOUT FAIL: ${msg}`);
  process.exit(1);
}

export function requireDb() {
  const url = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
  if (!url) unverified("DATABASE_URL not set — cannot compare to live books");
  return url;
}
