/**
 * G1 (GO-CLOSE-188 owner reply, 2026-08-30, corrected version): "the TEST label must actually set
 * is_sample_data. It does not." mdata.customers/mdata.vendors accepted is_sample_data as an
 * explicit opt-in field (ACCT-F220) but nothing ever DERIVED it from the name a human actually
 * typed, so every row someone named TEST/DEMO/SAMPLE went in untagged. Live-measured 2026-08-30:
 * mdata.customers 14/14 rows named TEST unflagged; mdata.vendors 39 named TEST, 36 unflagged.
 * INV-7 (verify-gl-invariants.sql) shows the resulting sample debits sitting inside the real trial
 * balance — 213,289.36 and climbing — as one direct, ongoing consequence.
 *
 * Word-boundary CONTAINS match, not a prefix — matches exactly how the owner counted the live gap.
 * Real fixture rows on prod today include suffix ("CC2-BOOKLOAD-INLINE-TEST"), embedded
 * ("GUARD-TEST-customers-name-TRANSP"), and lowercase ("Cascade-void-test-20260826") shapes that a
 * TEST%-prefix-only pattern (mdata/fleet-visibility.ts's FLEET_DEMO_PHANTOM_PATTERNS) would miss.
 * Word-boundary (not a bare substring) specifically excludes a real place-name false positive
 * found live: vendor "Loves-IN471-DEMOTTE (deleted)" contains "demo" but is not sample data.
 */
const SAMPLE_NAME_PATTERN = /\b(test|demo|sample)\b/i;

export function looksLikeSampleDataName(name: string | null | undefined): boolean {
  return typeof name === "string" && SAMPLE_NAME_PATTERN.test(name);
}
