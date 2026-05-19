BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'identity'
      AND table_name = 'users'
      AND column_name = 'preferred_language'
  ) THEN
    ALTER TABLE identity.users
      ALTER COLUMN preferred_language SET DEFAULT 'en';
  END IF;
END $$;

COMMIT;
