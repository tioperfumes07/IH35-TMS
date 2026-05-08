BEGIN;

CREATE TABLE IF NOT EXISTS identity.email_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  ip_address inet
);

CREATE INDEX IF NOT EXISTS idx_email_verifs_lookup
  ON identity.email_verifications(email, code, expires_at)
  WHERE consumed_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON identity.email_verifications TO ih35_app;

ALTER TABLE identity.users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE identity.users DROP CONSTRAINT IF EXISTS users_phone_key;

DROP INDEX IF EXISTS identity.idx_users_email;
DROP INDEX IF EXISTS identity.idx_users_phone;
DROP INDEX IF EXISTS identity.idx_identity_users_phone;

UPDATE identity.users u
SET email = lower(d.email)
FROM mdata.drivers d
WHERE d.identity_user_id = u.id
  AND d.email IS NOT NULL
  AND d.email <> ''
  AND u.email IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM identity.users u2
    WHERE u2.id <> u.id
      AND lower(u2.email) = lower(d.email)
  );

UPDATE identity.users u
SET phone = d.phone
FROM mdata.drivers d
WHERE d.identity_user_id = u.id
  AND d.phone IS NOT NULL
  AND d.phone <> ''
  AND u.phone IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM identity.users u2
    WHERE u2.id <> u.id
      AND u2.phone = d.phone
  );

DO $$
DECLARE dup_count int;
BEGIN
  SELECT count(*) INTO dup_count
  FROM (
    SELECT lower(email)
    FROM identity.users
    WHERE email IS NOT NULL
    GROUP BY lower(email)
    HAVING count(*) > 1
  ) x;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Duplicate emails exist in identity.users — clean up before adding unique constraint. dup_count=%', dup_count;
  END IF;
END $$;

DO $$
DECLARE dup_phone_count int;
BEGIN
  SELECT count(*) INTO dup_phone_count
  FROM (
    SELECT phone
    FROM identity.users
    WHERE phone IS NOT NULL
    GROUP BY phone
    HAVING count(*) > 1
  ) x;

  IF dup_phone_count > 0 THEN
    RAISE EXCEPTION 'Duplicate phones exist in identity.users — clean up before adding unique constraint. dup_count=%', dup_phone_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
  ON identity.users(lower(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
  ON identity.users(phone)
  WHERE phone IS NOT NULL;

COMMIT;
