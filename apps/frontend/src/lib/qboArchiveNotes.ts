/** Internal qbo_archive sync metadata projected into mdata notes — not operator-facing. */
export const QBO_ARCHIVE_PROJECTION_SOURCE_RE = /Projected from qbo_archive\.entities_snapshot[^\n]*/gi;

export function scrubQboArchiveProjectionNotes(notes: string | null | undefined): string {
  const raw = String(notes ?? "");
  if (!raw || !QBO_ARCHIVE_PROJECTION_SOURCE_RE.test(raw)) return raw.trim();
  QBO_ARCHIVE_PROJECTION_SOURCE_RE.lastIndex = 0;
  return raw.replace(QBO_ARCHIVE_PROJECTION_SOURCE_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

export function displayEntityNotes(notes: string | null | undefined): string {
  const cleaned = scrubQboArchiveProjectionNotes(notes);
  return cleaned.length > 0 ? cleaned : "";
}
