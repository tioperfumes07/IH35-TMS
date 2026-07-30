/**
 * Shared banking.transfers density floor (BANK-ECON-03 / BANK-SURF-03).
 * PASS when evidence cites transfers=N with N >= 1 (live operator/API smoke).
 */
export const MEANINGFUL_TRANSFERS = 1;

export function parseTransfersCount(evidence) {
  const ev = String(evidence || "");
  const m = ev.match(/transfers\s*=\s*(\d+)/i);
  if (!m) return null;
  return Number(m[1]);
}

export function transfersDensityMeaningful(evidence) {
  const n = parseTransfersCount(evidence);
  return n != null && n >= MEANINGFUL_TRANSFERS;
}
