-- PERFUME-CAMPAIGNS-TRADERS (owner 2026-11-26 16:59 CT: "ok get this all completely done now. lets go." — design boards
-- 3 "Traders planning" and 4 "Mass email campaign" of the TIO Contacts & Campaigns canvas).
--
-- 1) perfume.contact_segments   — a saved set of Contacts-tab filters (role, country, state, city, category, source, how).
-- 2) perfume.campaigns          — one mass email: who (segment filters), what (subject / message in English and Spanish,
--                                 attachment names), when (now or one scheduled time), pace, and its counts.
-- 3) perfume.campaign_batches   — the send batches (perfume.mail_send_batches, 500 addresses each) a campaign started.
--    perfume.campaign_attachments — the files the campaign sends (kept so a scheduled send has them).
-- 4) perfume.trades             — one trade: an item a vendor offered, buy / sell price, quantity, stage on the board.
-- 5) perfume.trade_buyers       — the buyers matched to a trade and where each one stands.
--
-- Sending reuses perfume.mail_send_batches / perfume.mail_sends / perfume.mail_optouts (jpm@tioperfumes.com only, daily
-- cap, opt-outs always skipped). Never the trucking app's automatic email (EMAIL_CRON_ENABLED stays untouched).
-- Isolated perfume schema (ScentsX LLC): no operating_company_id, never posts to accounting, references only perfume.* and
-- identity.users. FORCE RLS owner-only like every perfume table. No DELETE grant: rows are archived, never deleted.
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS perfume.contact_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(filters) = 'object'),
  archived_at timestamptz,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS contact_segments_name_uq ON perfume.contact_segments (lower(btrim(name))) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS perfume.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  segment_id uuid REFERENCES perfume.contact_segments(id),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(filters) = 'object'),
  language text NOT NULL DEFAULT 'auto' CHECK (language IN ('auto', 'en', 'es')),
  subject_en text CHECK (subject_en IS NULL OR length(btrim(subject_en)) BETWEEN 1 AND 300),
  subject_es text CHECK (subject_es IS NULL OR length(btrim(subject_es)) BETWEEN 1 AND 300),
  body_en text CHECK (body_en IS NULL OR length(body_en) <= 20000),
  body_es text CHECK (body_es IS NULL OR length(body_es) <= 20000),
  attachment_names text[] NOT NULL DEFAULT '{}',
  per_hour integer NOT NULL DEFAULT 600 CHECK (per_hour BETWEEN 10 AND 3000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'stopped', 'failed')),
  scheduled_for timestamptz,
  recipients integer NOT NULL DEFAULT 0 CHECK (recipients >= 0),
  sent integer NOT NULL DEFAULT 0 CHECK (sent >= 0),
  skipped integer NOT NULL DEFAULT 0 CHECK (skipped >= 0),
  failed integer NOT NULL DEFAULT 0 CHECK (failed >= 0),
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  archived_at timestamptz,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaigns_scheduled_has_time CHECK (status <> 'scheduled' OR scheduled_for IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS campaigns_created_idx ON perfume.campaigns (created_at DESC);
CREATE INDEX IF NOT EXISTS campaigns_due_idx ON perfume.campaigns (scheduled_for) WHERE status = 'scheduled';

CREATE TABLE IF NOT EXISTS perfume.campaign_batches (
  campaign_id uuid NOT NULL REFERENCES perfume.campaigns(id),
  batch_id uuid NOT NULL REFERENCES perfume.mail_send_batches(id),
  language text NOT NULL CHECK (language IN ('en', 'es')),
  seq integer NOT NULL CHECK (seq >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, batch_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_batches_batch_uq ON perfume.campaign_batches (batch_id);

CREATE TABLE IF NOT EXISTS perfume.campaign_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES perfume.campaigns(id),
  file_name text NOT NULL CHECK (length(btrim(file_name)) BETWEEN 1 AND 200),
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  content bytea NOT NULL,
  bytes integer NOT NULL CHECK (bytes > 0 AND bytes <= 20971520),
  archived_at timestamptz,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaign_attachments_campaign_idx ON perfume.campaign_attachments (campaign_id) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS perfume.trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item text NOT NULL CHECK (length(btrim(item)) BETWEEN 1 AND 300),
  brand text,
  upc text,
  from_company_id uuid REFERENCES perfume.contact_companies(id),
  buy_cents bigint CHECK (buy_cents IS NULL OR buy_cents > 0),
  sell_cents bigint CHECK (sell_cents IS NULL OR sell_cents > 0),
  qty integer CHECK (qty IS NULL OR qty > 0),
  stage text NOT NULL DEFAULT 'offer_received' CHECK (stage IN ('offer_received', 'buyers_matched', 'offer_sent', 'negotiating', 'closed', 'lost')),
  note text CHECK (note IS NULL OR length(note) <= 4000),
  closed_on date,
  archived_at timestamptz,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trades_stage_idx ON perfume.trades (stage, updated_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS trades_from_company_idx ON perfume.trades (from_company_id);

CREATE TABLE IF NOT EXISTS perfume.trade_buyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES perfume.trades(id),
  company_id uuid NOT NULL REFERENCES perfume.contact_companies(id),
  status text NOT NULL DEFAULT 'matched' CHECK (status IN ('matched', 'offered', 'negotiating', 'won', 'lost')),
  offer_cents bigint CHECK (offer_cents IS NULL OR offer_cents > 0),
  note text CHECK (note IS NULL OR length(note) <= 2000),
  archived_at timestamptz,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS trade_buyers_uq ON perfume.trade_buyers (trade_id, company_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS trade_buyers_company_idx ON perfume.trade_buyers (company_id);

ALTER TABLE perfume.contact_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.contact_segments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contact_segments_owner_only ON perfume.contact_segments;
CREATE POLICY contact_segments_owner_only ON perfume.contact_segments USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.contact_segments TO ih35_app;

ALTER TABLE perfume.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.campaigns FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campaigns_owner_only ON perfume.campaigns;
CREATE POLICY campaigns_owner_only ON perfume.campaigns USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.campaigns TO ih35_app;

ALTER TABLE perfume.campaign_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.campaign_batches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campaign_batches_owner_only ON perfume.campaign_batches;
CREATE POLICY campaign_batches_owner_only ON perfume.campaign_batches USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT ON perfume.campaign_batches TO ih35_app;

ALTER TABLE perfume.campaign_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.campaign_attachments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campaign_attachments_owner_only ON perfume.campaign_attachments;
CREATE POLICY campaign_attachments_owner_only ON perfume.campaign_attachments USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.campaign_attachments TO ih35_app;

ALTER TABLE perfume.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.trades FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trades_owner_only ON perfume.trades;
CREATE POLICY trades_owner_only ON perfume.trades USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.trades TO ih35_app;

ALTER TABLE perfume.trade_buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.trade_buyers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trade_buyers_owner_only ON perfume.trade_buyers;
CREATE POLICY trade_buyers_owner_only ON perfume.trade_buyers USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.trade_buyers TO ih35_app;
