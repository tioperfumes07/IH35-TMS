-- 0193_identity_user_names.sql
-- Add office-facing user profile columns used by Users management UI.
-- F.24-safe additive migration: no destructive changes.

BEGIN;

ALTER TABLE identity.users
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

COMMIT;
