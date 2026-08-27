BEGIN;

ALTER TABLE safety.accident_reports
  ADD COLUMN IF NOT EXISTS photo_keys text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN safety.accident_reports.photo_keys IS
  'Append-only R2 object keys for accident evidence uploaded through the Safety accident drawer.';

COMMIT;
