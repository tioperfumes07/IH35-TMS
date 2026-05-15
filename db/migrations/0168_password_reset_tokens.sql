-- Phase 7 Block F: office password reset tokens + optional password hash for email login.
-- Standing Order #18: PUBLIC grants, IF NOT EXISTS guards, no ih35_app coupling in grants.

BEGIN;

ALTER TABLE identity.users
  ADD COLUMN IF NOT EXISTS password_hash text NULL;

CREATE TABLE IF NOT EXISTS identity.password_reset_tokens (
  token uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  created_ip inet NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_user_id_created_at
  ON identity.password_reset_tokens (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_expires_at
  ON identity.password_reset_tokens (expires_at)
  WHERE used_at IS NULL;

ALTER TABLE identity.password_reset_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS password_reset_tokens_open ON identity.password_reset_tokens;

CREATE POLICY password_reset_tokens_open
  ON identity.password_reset_tokens
  FOR ALL
  TO PUBLIC
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON identity.password_reset_tokens TO PUBLIC;

COMMIT;
