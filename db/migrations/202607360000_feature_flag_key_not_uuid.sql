-- Feature-flag key hygiene (2026-07-12). A company/entity UUID was written into lib.feature_flags.flag_key,
-- producing a junk row that is not a real flag (e.g. '91e0bf0a-...'). This migration:
--   (1) removes any UUID-shaped flag_key rows (overrides first for referential safety, then the flag), and
--   (2) adds a CHECK constraint so a UUID-shaped flag_key can NEVER be inserted again.
-- Idempotent + CI-safe: on a fresh DB there is no junk row (DELETEs are no-ops) and the constraint is added
-- once. The DELETE runs BEFORE the constraint so an existing junk row cannot block ADD CONSTRAINT.
-- Not a financial table (lib.*), additive-constraint + junk cleanup only — but still owner-gated (schema
-- change): never self-merge.

BEGIN;

-- (1) remove UUID-shaped junk keys. Overrides reference flag_key; clear them first.
DELETE FROM lib.feature_flag_overrides
 WHERE flag_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

DELETE FROM lib.feature_flags
 WHERE flag_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- (2) enforce: a flag_key can never be UUID-shaped. Idempotent add.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'feature_flags_flag_key_not_uuid'
      AND conrelid = 'lib.feature_flags'::regclass
  ) THEN
    ALTER TABLE lib.feature_flags
      ADD CONSTRAINT feature_flags_flag_key_not_uuid
      CHECK (flag_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
  END IF;
END $$;

COMMIT;
