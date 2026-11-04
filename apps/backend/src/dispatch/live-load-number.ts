/**
 * Row 124(d) (ACCT-F11065) — mdata.loads.live_load_number is the AlwaysTrack / legacy reference ("Live #", the AT# the
 * Book Load wizard captures — verify-book-load-live-load-number-field.mjs). It names ANOTHER system's number for the load.
 *
 * Root cause: the Settlement Creator seed (settlement-creator-seed-loads.ts) passed live_load_number = the load's own TMS
 * load_number, and Book Load wrote whatever it was given. Measured on prod 11-03 from audit.row_changes: 159 of 572 USMCA
 * load INSERTs wrote live_load_number = load_number (13694 / 13695 among them, cleared by a script 10-24 21:13 UTC); the
 * self-reference also fed invoice-render's "customer W/O" fallback and the dispatch sheet's "Live #" with the TMS number.
 *
 * Fix at the one INSERT: a live number equal to the load's own number is not a live number — it is stored NULL.
 */
export function liveLoadNumberForInsert(liveLoadNumber: string | null | undefined, loadNumber: string | null | undefined): string | null {
  const live = typeof liveLoadNumber === "string" ? liveLoadNumber.trim() : "";
  if (!live) return null;
  const own = typeof loadNumber === "string" ? loadNumber.trim() : "";
  if (own && live.toUpperCase() === own.toUpperCase()) return null;
  return live;
}
