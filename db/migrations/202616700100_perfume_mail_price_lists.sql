-- PERFUME-DESK (owner 2026-11-25 17:29 / 17:32 CT): "CAN WE CREATE AN ENGINE THAT AUTOMATICALLY GOES TO MY MAIL APP,
-- GETS ALL THE PRICE LISTS DAILY AND UPDATES THE APP WITH THE NEW PRICES? … FROM TIOPERFUMES07@GMAIL.COM AND FROM
-- JPM@TIOPERFUMES.COM. TIOPERFUMES PROGRAM YOU CREATED WITHIN THE TRANSPORTATION APP."
--
-- The mail price-list engine. Every morning it reads the owner's two TIO mailboxes (read-only Gmail access the owner
-- grants himself by signing in on the desk), takes the price-list attachments from the senders he set up, and saves each
-- one through the SAME import the Lists tab uses (to-the-cent total check, a new list replaces the vendor's old one, a
-- special list is kept next to it). Anything it cannot read or does not recognise is HELD and shown on the desk — never
-- guessed, never dropped silently.
--
-- 1) perfume.mail_accounts — a connected mailbox. The Google refresh token is stored ENCRYPTED (aes-256-gcm,
--    lib/encryption.ts, ENCRYPTION_KEY); the app never logs or returns it. Disconnecting wipes it.
-- 2) perfume.mail_rules    — "mail from this address (or @domain) is this vendor's price list"; optional file-name text
--    when one sender sends two lists (Elegance + Elegance ARABIC); special = keep next to the regular list;
--    ignore = this sender's attachments are not price lists (the owner said so on the desk).
-- 3) perfume.mail_files    — every price-list attachment the engine saw: imported (with its list), held (and why), or
--    from a sender not set up yet. One row per mailbox + message + file name, so a file is never imported twice.
-- 4) perfume.mail_runs     — one row per run (scheduled or "Check mail now"), with its counts.
--
-- Isolated perfume schema (ScentsX LLC): no operating_company_id, never posts to accounting. FORCE RLS owner-only like
-- every perfume table. No DELETE grant: rules are switched off, mailboxes are disconnected, history is kept.
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS perfume.mail_accounts (
  email text PRIMARY KEY CHECK (email = lower(email) AND email LIKE '%_@_%'),
  refresh_token_enc bytea,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'reconnect', 'disconnected')),
  last_error text,
  connected_by uuid REFERENCES identity.users(id),
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'connected' OR refresh_token_enc IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS perfume.mail_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_address text NOT NULL CHECK (from_address = lower(btrim(from_address)) AND from_address LIKE '%@_%'),
  file_text text CHECK (file_text IS NULL OR length(btrim(file_text)) BETWEEN 1 AND 120),
  vendor_id uuid REFERENCES perfume.vendors(id),
  special boolean NOT NULL DEFAULT false,
  ignore boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ignore OR vendor_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS mail_rules_active_uq
  ON perfume.mail_rules (from_address, lower(coalesce(file_text, ''))) WHERE active;

CREATE TABLE IF NOT EXISTS perfume.mail_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL CHECK (trigger IN ('schedule', 'manual')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  accounts integer NOT NULL DEFAULT 0,
  messages_seen integer NOT NULL DEFAULT 0,
  imported integer NOT NULL DEFAULT 0,
  held integer NOT NULL DEFAULT 0,
  unassigned integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  error text,
  started_by uuid REFERENCES identity.users(id)
);

CREATE TABLE IF NOT EXISTS perfume.mail_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_email text NOT NULL REFERENCES perfume.mail_accounts(email),
  external_gmail_message_id text NOT NULL CHECK (length(external_gmail_message_id) BETWEEN 1 AND 200),
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 300),
  sender text NOT NULL,
  subject text,
  received_at timestamptz NOT NULL,
  sha256 text,
  status text NOT NULL CHECK (status IN ('imported', 'held', 'unassigned', 'duplicate', 'failed')),
  reason text,
  rule_id uuid REFERENCES perfume.mail_rules(id),
  vendor_id uuid REFERENCES perfume.vendors(id),
  list_id uuid REFERENCES perfume.price_lists(id),
  rows_read integer,
  rows_saved integer,
  file_total_cents bigint,
  import_check jsonb,
  run_id uuid REFERENCES perfume.mail_runs(id),
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_email, external_gmail_message_id, file_name),
  CHECK (status <> 'imported' OR list_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS mail_files_received_idx ON perfume.mail_files (received_at DESC);
CREATE INDEX IF NOT EXISTS mail_files_sha_idx ON perfume.mail_files (vendor_id, sha256) WHERE status = 'imported';

ALTER TABLE perfume.mail_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.mail_accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_accounts_owner_only ON perfume.mail_accounts;
CREATE POLICY mail_accounts_owner_only ON perfume.mail_accounts USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.mail_accounts TO ih35_app;

ALTER TABLE perfume.mail_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.mail_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_rules_owner_only ON perfume.mail_rules;
CREATE POLICY mail_rules_owner_only ON perfume.mail_rules USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.mail_rules TO ih35_app;

ALTER TABLE perfume.mail_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.mail_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_runs_owner_only ON perfume.mail_runs;
CREATE POLICY mail_runs_owner_only ON perfume.mail_runs USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.mail_runs TO ih35_app;

ALTER TABLE perfume.mail_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.mail_files FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_files_owner_only ON perfume.mail_files;
CREATE POLICY mail_files_owner_only ON perfume.mail_files USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.mail_files TO ih35_app;
