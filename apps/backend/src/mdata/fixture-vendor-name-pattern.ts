// VEND-3 / FACT-FIX-1 fixture-vendor name pattern — SINGLE SOURCE OF TRUTH.
//
// Previously vendors.routes.ts held an inline /^TEST[-_ ]/ prefix guard on create only.
// That missed renames to TEST-VENDOR on patch and names where TEST-VENDOR appears mid-string.
// The pattern now lives here; vendors.routes.ts (create + patch) and the CI guard import it.
//
// Matches TEST-VENDOR, TEST_VENDOR, TEST VENDOR, test-vendor, etc. (case-insensitive).
export const TEST_VENDOR_FIXTURE_RE = /test[-_ ]vendor/i;

/**
 * Returns true when `name` contains the TEST-VENDOR fixture naming pattern.
 */
export function isTestVendorFixtureName(name: string): boolean {
  return TEST_VENDOR_FIXTURE_RE.test(name.trim());
}
