BEGIN;

ALTER TABLE identity.users
  ADD COLUMN IF NOT EXISTS preferred_language text;

UPDATE identity.users
SET preferred_language = 'en'
WHERE preferred_language IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'identity'
      AND table_name = 'users'
      AND column_name = 'preferred_language'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE identity.users
      ALTER COLUMN preferred_language SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_preferred_language_check'
      AND conrelid = 'identity.users'::regclass
  ) THEN
    ALTER TABLE identity.users
      ADD CONSTRAINT users_preferred_language_check
      CHECK (preferred_language IN ('en', 'es'));
  END IF;
END $$;

COMMIT;
