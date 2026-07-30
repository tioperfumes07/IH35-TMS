/**
 * Shared bank-feed matched_journal_entry_id density floor (ACCT-LINK-06 / BANK-ECON-02).
 * Owner live-ops (2026-07-30): meaningfully above historic ~5 of ~10k.
 */
export const MEANINGFUL_MATCHED_JE = 50;

/** Parse matched_je=N/M or matched_journal_entry_id=N/M from evidence. */
export function parseMatchedJeDensity(evidence) {
  const ev = String(evidence || "");
  const m = ev.match(/matched(?:_je|_journal_entry_id)\s*=\s*(\d+)\s*\/\s*(\d+)/i);
  if (!m) return null;
  return { matched: Number(m[1]), total: Number(m[2]) };
}

export function densityIsMeaningful(evidence) {
  const d = parseMatchedJeDensity(evidence);
  return Boolean(d && d.matched >= MEANINGFUL_MATCHED_JE && d.total > 0);
}
