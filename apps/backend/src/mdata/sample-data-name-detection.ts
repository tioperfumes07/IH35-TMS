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

/**
 * A second class of seat-authored fixture rows found live 2026-09-04 (owner doc "Factoring Is
 * Built and Running... Eleven test customers are sitting in the live USMCA customer list"):
 * P23-SMOKE-1786500785935, CC2-GUARD-VERIFY-20260811-CUSTOMER, CODEX-AUDIT-SPINE-20260816-0320,
 * USMCA-CODEX-CREATE-20260810-0117, USMCA_P43_BILLING_SMOKE_20260812 -- none contain
 * "test"/"demo"/"sample" so SAMPLE_NAME_PATTERN above never caught them; they went in untagged and
 * had to be found and quarantined by hand. Prefix-anchored (not word-boundary, unlike
 * SAMPLE_NAME_PATTERN) — an agent/session identifier token is always the FIRST thing in the name a
 * seat writes, and no real carrier customer/vendor is ever going to start with one of these.
 */
const SEAT_SMOKE_PREFIX_PATTERN = /^(CC[1-3]?-|CODEX-|CASCADE-|CURSOR-|DEVIN-|P23-SMOKE-|USMCA[-_]CODEX-|USMCA_P\d+_)/i;

export function looksLikeSampleDataName(name: string | null | undefined): boolean {
  return typeof name === "string" && (SAMPLE_NAME_PATTERN.test(name) || SEAT_SMOKE_PREFIX_PATTERN.test(name));
}
