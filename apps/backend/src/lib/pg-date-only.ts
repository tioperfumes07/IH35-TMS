/**
 * ACCT-F11062 item 3 (live 11-03: Reports › Driver settlements Period read "10/21/2001–10/27/2001" on 10/2026 loads).
 *
 * ROOT CAUSE: node-pg parses a DATE column (OID 1082) into a JS Date at LOCAL midnight. The report did
 * `String(row.period_start).slice(0, 10)`; String(Date) is "Wed Oct 21 2026 00:00:00 GMT…", so the API sent
 * "Wed Oct 21" — no year. The browser then parsed "Wed Oct 21" and defaulted the year to 2001.
 *
 * THE rule for turning a pg date / timestamp value into a calendar day "YYYY-MM-DD":
 *   - a string (DATE::text, an ISO timestamp text) → its first 10 characters when they are a real Y-M-D;
 *   - a Date → its LOCAL calendar components (node-pg built a DATE at local midnight, so local components are the
 *     stored day; never toISOString(), which shifts a local-midnight Date across the date line west of UTC);
 *   - anything else → null (never a guessed day).
 * Guard: scripts/verify-live-fails-2.mjs forbids `String(<row value>).slice(0, 10)` in apps/backend/src.
 */
const YMD = /^(\d{4})-(\d{2})-(\d{2})/;

export function pgDateOnly(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  const match = YMD.exec(s);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

