-- BT-0-AUTH-01: Identity schema for Lucia + Google OAuth
-- Trace: Master Blueprint Part 7 §7.1, Build Spec §3.2 + §6.6

-- 1. Create identity schema
CREATE SCHEMA IF NOT EXISTS identity;

-- 2. Roles enum (locked vocabulary per Master Blueprint Part 5 §5.2)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_enum') THEN
    CREATE TYPE identity.role_enum AS ENUM (
      'Owner',
      'Administrator',
      'Manager',
      'Accountant',
      'Dispatcher',
      'Safety',
      'Driver',
      'Mechanic'
    );
  END IF;
END
$$;

-- 3. Users table
CREATE TABLE IF NOT EXISTS identity.users (
  uuid           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL UNIQUE,
  google_user_id text UNIQUE,
  role           identity.role_enum NOT NULL DEFAULT 'Driver',
  created_at     timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  CONSTRAINT users_email_lower CHECK (email = lower(email))
);

CREATE INDEX IF NOT EXISTS idx_users_role ON identity.users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON identity.users(deactivated_at) WHERE deactivated_at IS NULL;

-- 4. Sessions table (Lucia v3 PostgreSQL adapter contract — DO NOT change column names/types)
CREATE TABLE IF NOT EXISTS identity.sessions (
  id         text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES identity.users(uuid) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON identity.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON identity.sessions(expires_at);

-- 5. Last-owner-cannot-deactivate invariant (Blueprint Part 7 §7.1.5)
CREATE OR REPLACE FUNCTION identity.prevent_last_owner_deactivation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.role = 'Owner' OR OLD.role = 'Owner') AND NEW.deactivated_at IS NOT NULL THEN
    IF (
      SELECT count(*) FROM identity.users
      WHERE role = 'Owner' AND deactivated_at IS NULL
    ) <= 1 THEN
      RAISE EXCEPTION 'cannot deactivate the last active Owner (Blueprint Part 7 §7.1.5)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_owner_deactivation ON identity.users;
CREATE TRIGGER trg_prevent_last_owner_deactivation
BEFORE UPDATE ON identity.users
FOR EACH ROW
WHEN (OLD.deactivated_at IS NULL AND NEW.deactivated_at IS NOT NULL)
EXECUTE FUNCTION identity.prevent_last_owner_deactivation();

-- 6. Phase 0 RLS — minimal; tightens in Phase 1 with per-request current_user_id context
ALTER TABLE identity.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_phase0_all ON identity.users;
CREATE POLICY users_phase0_all ON identity.users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS sessions_phase0_all ON identity.sessions;
CREATE POLICY sessions_phase0_all ON identity.sessions FOR ALL USING (true) WITH CHECK (true);

-- Note: Phase 0 RLS policies allow all access via the application-level role.
-- Phase 1 will replace these with policies gating on current_setting('app.current_user_id', true).
