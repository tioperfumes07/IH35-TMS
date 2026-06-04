-- P0-USERS-500: track last office/auth session on identity.users (additive, archive-not-delete).

BEGIN;

ALTER TABLE identity.users
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

COMMENT ON COLUMN identity.users.last_login_at IS
  'Timestamp of the user''s most recent successful session creation (office, Google, phone, or invite login). NULL until first login.';

GRANT SELECT, INSERT, UPDATE ON identity.users TO ih35_app;

UPDATE identity.users
SET deactivated_at = COALESCE(deactivated_at, now())
WHERE lower(email) = lower('claude-debug-test@example.invalid')
  AND deactivated_at IS NULL;

COMMIT;

-- DOWN
-- BEGIN;
-- ALTER TABLE identity.users DROP COLUMN IF EXISTS last_login_at;
-- COMMIT;
