-- 0405_owner_todays_attention_snapshot.sql
-- GAP-65: Owner Today's Attention Top-5 Aggregator
-- Stores the latest computed top-5 attention items per operating_company, refreshed every 15 min.

CREATE SCHEMA IF NOT EXISTS owner;

CREATE TABLE IF NOT EXISTS owner.todays_attention_snapshot (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL,
  item_id               text NOT NULL,         -- stable key e.g. "fuel_fraud_alert:uuid"
  source                text NOT NULL,          -- e.g. "fuel_fraud", "engine_fault_wo", ...
  score                 integer NOT NULL,        -- 0–100, higher = more urgent
  title                 text NOT NULL,
  body                  text NOT NULL DEFAULT '',
  action_url            text NOT NULL DEFAULT '',
  action_label          text NOT NULL DEFAULT 'View',
  severity              text NOT NULL DEFAULT 'warning', -- info | warning | error | critical
  extra                 jsonb NOT NULL DEFAULT '{}',
  dismissed             boolean NOT NULL DEFAULT false,
  dismissed_by          uuid,
  dismissed_at          timestamptz,
  computed_at           timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Index for fast company lookups (non-dismissed, ordered by score DESC)
CREATE INDEX IF NOT EXISTS idx_todays_attention_company_active
  ON owner.todays_attention_snapshot (operating_company_id, dismissed, score DESC)
  WHERE dismissed = false;

-- Unique constraint: one row per (company, item_id) so upserts work
CREATE UNIQUE INDEX IF NOT EXISTS idx_todays_attention_company_item
  ON owner.todays_attention_snapshot (operating_company_id, item_id);

-- RLS: Owner + Administrator may read/dismiss; system writes bypass via lucia
ALTER TABLE owner.todays_attention_snapshot ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'owner' AND tablename = 'todays_attention_snapshot' AND policyname = 'todays_attention_owner_select'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY todays_attention_owner_select
        ON owner.todays_attention_snapshot
        FOR SELECT
        USING (
          operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
          AND (
            current_setting('app.bypass_rls', true) = 'lucia'
            OR current_setting('app.user_role', true) IN ('Owner', 'Administrator')
          )
        )
    $policy$;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'owner' AND tablename = 'todays_attention_snapshot' AND policyname = 'todays_attention_owner_update'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY todays_attention_owner_update
        ON owner.todays_attention_snapshot
        FOR UPDATE
        USING (
          operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
          AND (
            current_setting('app.bypass_rls', true) = 'lucia'
            OR current_setting('app.user_role', true) IN ('Owner', 'Administrator')
          )
        )
    $policy$;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'owner' AND tablename = 'todays_attention_snapshot' AND policyname = 'todays_attention_system_write'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY todays_attention_system_write
        ON owner.todays_attention_snapshot
        FOR ALL
        USING (current_setting('app.bypass_rls', true) = 'lucia')
    $policy$;
  END IF;
END$$;
