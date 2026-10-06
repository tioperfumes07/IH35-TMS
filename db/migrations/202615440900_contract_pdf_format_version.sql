-- 202615440900 — contract PDF format versioning (CC-3, 2026-10-06; claimed).
--
-- MEASURED: the 3 USMCA contracts were filed at 15:48-15:49Z (first open), before the legal-document format shipped
-- (#25590: 12pt serif, 1in margins, "Page X of Y"). Open PDF serves the filed file, so they still showed the old layout:
-- a filed document had no record of the format it was rendered in, so nothing could tell it was stale.
--
-- pdf_format_version records the renderer format of the contract's current filed PDF. NULL = rendered before
-- versioning existed (treated as format 1). The engine re-files an UNSIGNED contract whose PDF is older than the current
-- format the next time it is opened (new docs.files version, parent_file_id -> previous; nothing deleted). An EXECUTED
-- contract's PDF is the signed record and is never re-rendered.
--
-- Idempotent. Writes no rows.
BEGIN;
ALTER TABLE legal.contract_instances ADD COLUMN IF NOT EXISTS pdf_format_version smallint;
COMMENT ON COLUMN legal.contract_instances.pdf_format_version IS
  'Renderer format of the current filed PDF (pdf-renderer.service CONTRACT_PDF_FORMAT_VERSION). NULL = pre-versioning (format 1).';
COMMIT;
