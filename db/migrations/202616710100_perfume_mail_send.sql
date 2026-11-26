-- PERFUME-DESK (owner 2026-11-25 22:50 CT): "WE NEED TO ACTIVATE THE OUTGOING EMAILS WITH JPM@TIOPERFUMES.COM SO I CAN
-- SEND THE LISTS FROM THE APP, SO FIX THE APP AND THE ENGINE TO DO THAT."
--
-- Sending the owner's lists from jpm@tioperfumes.com. This is NOT the trucking app's automatic email (EMAIL_CRON_ENABLED,
-- paused by the owner 2026-11-25 17:34 CT) — nothing here is queued or sent on a schedule. A send happens only when the
-- owner presses Send on the desk; each recipient gets their own email from jpm@tioperfumes.com through Gmail (the owner
-- grants send access himself by signing in to that mailbox on the desk).
--
-- 1) perfume.mail_accounts.can_send — the mailbox grant includes Gmail send (only jpm@tioperfumes.com may be a sender).
-- 2) perfume.mail_send_batches — one row per Send press: from, subject, message, attachment names, counts, status.
-- 3) perfume.mail_sends — one row per recipient of a batch: sent / skipped (opted out, duplicate) / failed, Gmail id.
-- 4) perfume.mail_optouts — addresses that asked not to receive lists; a send always skips them.
--
-- Isolated perfume schema (ScentsX LLC): no operating_company_id, never posts to accounting. FORCE RLS owner-only like
-- every perfume table. No DELETE on sends/batches (history is kept); an opt-out can be removed by the owner.
-- Additive, idempotent.

ALTER TABLE perfume.mail_accounts ADD COLUMN IF NOT EXISTS can_send boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS perfume.mail_send_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_email text NOT NULL REFERENCES perfume.mail_accounts(email),
  subject text NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 300),
  body_text text NOT NULL CHECK (length(body_text) <= 20000),
  attachment_names text[] NOT NULL DEFAULT '{}',
  attachment_bytes bigint NOT NULL DEFAULT 0 CHECK (attachment_bytes >= 0),
  recipients integer NOT NULL CHECK (recipients BETWEEN 1 AND 500),
  sent integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'done', 'stopped', 'failed')),
  error text,
  started_by uuid REFERENCES identity.users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS mail_send_batches_started_idx ON perfume.mail_send_batches (started_at DESC);

CREATE TABLE IF NOT EXISTS perfume.mail_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES perfume.mail_send_batches(id),
  to_email text NOT NULL CHECK (to_email = lower(to_email) AND to_email LIKE '%_@_%'),
  status text NOT NULL CHECK (status IN ('sent', 'skipped_optout', 'failed')),
  gmail_message_id text,
  error text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, to_email)
);
CREATE INDEX IF NOT EXISTS mail_sends_to_idx ON perfume.mail_sends (to_email, sent_at DESC);

CREATE TABLE IF NOT EXISTS perfume.mail_optouts (
  email text PRIMARY KEY CHECK (email = lower(email) AND email LIKE '%_@_%'),
  reason text CHECK (reason IS NULL OR length(reason) <= 300),
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE perfume.mail_send_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.mail_send_batches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_send_batches_owner_only ON perfume.mail_send_batches;
CREATE POLICY mail_send_batches_owner_only ON perfume.mail_send_batches USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.mail_send_batches TO ih35_app;

ALTER TABLE perfume.mail_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.mail_sends FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_sends_owner_only ON perfume.mail_sends;
CREATE POLICY mail_sends_owner_only ON perfume.mail_sends USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT ON perfume.mail_sends TO ih35_app;

ALTER TABLE perfume.mail_optouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.mail_optouts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_optouts_owner_only ON perfume.mail_optouts;
CREATE POLICY mail_optouts_owner_only ON perfume.mail_optouts USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, DELETE ON perfume.mail_optouts TO ih35_app;
