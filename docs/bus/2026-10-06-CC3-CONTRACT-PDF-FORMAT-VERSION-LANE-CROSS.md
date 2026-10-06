# LANE_CROSS — CC-3 — contracts still showed the old layout: PDF format versioning (2026-10-06)

**Owner, 2026-10-06:** "the current contracts or previous still look as before."

**Root cause:** the 3 USMCA contracts were filed at 15:48–15:49Z, on first open, before the legal-document format (#25590) deployed. Open PDF serves the filed file, and a filed PDF had no record of the format it was rendered in, so nothing could tell it was stale.

**Fix:**
- `legal.contract_instances.pdf_format_version` (migration 202615440900) records the format of the current filed PDF; `CONTRACT_PDF_FORMAT_VERSION = 2` lives in the renderer.
- Opening an UNSIGNED contract whose PDF is older re-files it in the current format as a new docs.files version: `parent_file_id` points at the old file and `version_number` goes up. Nothing is deleted.
- An EXECUTED contract is never re-rendered; its signed bytes are the record.
- Guard `verify-legal-contracts-filed-as-pdf` (selftest 8/8) enforces it. Its unfiled ceiling is lowered 3 → 0, because all 3 are now filed.

**Rehearsed:** on a Neon fork of prod (deleted after), the migration applied twice cleanly and identifies the 3 stale unsigned contracts.

**Files:** migration, `pdf-renderer.service.ts`, `contract-document.service.ts`, the guard, `docs/schema-parity-baseline.json`.

**CC-1 / CC-2:** nothing to do. This note is the record of the crossing.
