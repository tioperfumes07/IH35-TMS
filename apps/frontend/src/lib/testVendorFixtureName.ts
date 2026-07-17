/** VEND-3: client-side mirror of backend isTestVendorFixtureName (prod-only UX hint). */
const TEST_VENDOR_FIXTURE_RE = /test[-_ ]vendor/i;

export function isTestVendorFixtureName(name: string): boolean {
  return TEST_VENDOR_FIXTURE_RE.test(name.trim());
}
