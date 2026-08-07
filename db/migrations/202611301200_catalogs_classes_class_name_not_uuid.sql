-- Cursor picker-class fix (Cascade row 601): refuse UUID-as-label class names.
-- Neon lucia 2026-08-03: 0 rows currently match the UUID pattern — no UPDATE needed.
-- Additive CHECK only (no DML against existing rows). Owner Neon-apply after merge.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_catalogs_classes_class_name_not_uuid'
      AND conrelid = 'catalogs.classes'::regclass
  ) THEN
    ALTER TABLE catalogs.classes
      ADD CONSTRAINT chk_catalogs_classes_class_name_not_uuid
      CHECK (
        class_name IS NULL
        OR (
          class_name !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND class_name <> id::text
        )
      );
  END IF;
END $$;

COMMIT;
