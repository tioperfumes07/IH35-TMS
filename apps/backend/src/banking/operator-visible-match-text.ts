/**
 * ROUND 433-CUR B7 — operator-visible match Description / recommendation text.
 *
 * Owner saw `session 7a7d1da9-aa5b-4de7-b` inside a match recommendation description (recon SC
 * memo that used the session uuid as a string key). ROUND 390.3 killed that writer and linked the
 * session on the spine; this helper is the fail-closed display gate so any leftover or new
 * internal id never reaches the Match Description column or link-suggestion labels.
 *
 * Spines keep ids. People read nouns + display numbers.
 */
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** "· session <uuid>" / "session <partial-uuid>" — the exact owner-visible junk shape. */
const SESSION_ID_RE = /\s*[·•\-]?\s*session\s+[0-9a-f-]{8,}/gi;
/** Trailing 8-hex suffix from writers that did `sourceId.slice(0, 8)` into a memo. */
const SHORT_ID_SUFFIX_RE = /\s+[0-9a-f]{8}(?=\s|$)/gi;

export function operatorVisibleMatchText(raw: string | null | undefined): string {
  if (raw == null) return "";
  let s = String(raw);
  s = s.replace(SESSION_ID_RE, "");
  s = s.replace(UUID_RE, "");
  s = s.replace(SHORT_ID_SUFFIX_RE, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  s = s.replace(/\s*[·•\-–—,:]\s*$/g, "").trim();
  return s;
}
