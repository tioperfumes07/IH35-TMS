BEGIN;

ALTER TABLE identity.users
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE identity.users
  ADD COLUMN IF NOT EXISTS phone text UNIQUE,
  ADD COLUMN IF NOT EXISTS auth_phone_verified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_identity_users_phone
  ON identity.users (phone)
  WHERE phone IS NOT NULL;

COMMENT ON COLUMN identity.users.phone IS 'E.164 format (e.g., +19565550001 or +529565550001). Unique. Used for phone-based authentication.';
COMMENT ON COLUMN identity.users.auth_phone_verified_at IS 'Timestamp of last successful phone OTP verification. Updated on every successful phone login.';

COMMIT;
