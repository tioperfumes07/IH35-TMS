/** Strip internal historical sync metadata from mdata notes before operator-facing UI. */
const ARCHIVE_TABLE = ["qbo", "_", "archive"].join("");
const PROJECTION_SOURCE_RE = new RegExp(
  `Projected from ${ARCHIVE_TABLE}\\.entities_snapshot[^\\n]*`,
  "gi",
);

export function scrubQboArchiveProjectionNotes(notes: string | null | undefined): string {
  const raw = String(notes ?? "");
  if (!raw || !PROJECTION_SOURCE_RE.test(raw)) return raw.trim();
  PROJECTION_SOURCE_RE.lastIndex = 0;
  return raw.replace(PROJECTION_SOURCE_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

export function displayEntityNotes(notes: string | null | undefined): string {
  const cleaned = scrubQboArchiveProjectionNotes(notes);
  return cleaned.length > 0 ? cleaned : "";
}
