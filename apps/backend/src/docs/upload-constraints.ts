/**
 * DOCS-2 (security): shared size + MIME constraints for the docs uploader.
 *
 * Before this, `docs/files.routes.ts` accepted `size_bytes >= 1` with NO upper bound and any
 * `mime_type` string (length-checked only). This mirrors the 25 MiB cap already enforced by the
 * universal attachments uploader (`documents/attachments.service.ts`) so both upload paths reject
 * oversized files, and adds a MIME allowlist.
 *
 * Design of the allowlist (permissive for real business docs, restrictive for attack vectors):
 *  - Includes `application/octet-stream` on purpose: the docs UploadModal sends
 *    `file.type || "application/octet-stream"`, so this is the browser's fallback whenever it
 *    cannot sniff a type (common for .csv / .heic / some .xlsx). Blocking it would break legit
 *    uploads. It is also XSS-safe: browsers DOWNLOAD octet-stream, they never render it inline.
 *  - Deliberately EXCLUDES inline-renderable / executable types (`text/html`,
 *    `application/xhtml+xml`, `image/svg+xml`, `application/javascript`, `text/javascript`,
 *    `application/x-msdownload`, `application/x-sh`, …). Those are the stored-XSS / malware vectors
 *    a presigned-download of an attacker-controlled content-type would otherwise enable.
 */

/** 25 MiB — matches the attachments uploader cap (documents/attachments.service.ts MAX_SIZE_BYTES). */
export const MAX_DOC_UPLOAD_BYTES = 25 * 1024 * 1024;

export const ALLOWED_DOC_MIME_TYPES: ReadonlySet<string> = new Set([
  // documents
  "application/pdf",
  // browser-unknown fallback (forces download, never rendered inline) — see UploadModal.tsx
  "application/octet-stream",
  // images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/tiff",
  "image/bmp",
  // text / csv
  "text/plain",
  "text/csv",
  "application/csv",
  // spreadsheets
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // word processing
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // presentations
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // office files sometimes arrive labeled as a zip container
  "application/zip",
  // video parity with the attachments uploader
  "video/mp4",
]);

/** Case-insensitive membership test against the docs MIME allowlist. */
export function isAllowedDocMimeType(mimeType: string): boolean {
  return ALLOWED_DOC_MIME_TYPES.has(mimeType.trim().toLowerCase());
}
