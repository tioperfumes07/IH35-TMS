-- [HOLD-FOR-JORGE — TIER 1] Relay Payments fuel-transaction INGEST storage (pull + webhook staging).
--
-- *** DO NOT MERGE. DO NOT RUN ON PROD. *** BUILT-AND-HELD per Jorge's instruction: this creates new
-- tables + a new mdata.drivers column, so it is a financial-cluster migration (constitution §1.4) —
-- run ONLY on a Neon branch by Jorge's hand, then ledger-backfilled so prod db:migrate skips it.
--
-- SCOPE: this migration builds ONLY the raw ingest/staging layer for Relay Payments fuel-card
-- transactions (GET pull + webhook), matched (read-only lookups) to our driver/unit master data.
-- It does NOT post anything to accounting.*, does NOT touch fuel.fuel_transactions (the canonical
-- consumption table other modules already read — IFTA gallons, load-profitability, CPM, driver fuel
-- history, fraud-detector), and does NOT create any bill/expense/JE. Projecting a staged Relay row
-- into fuel.fuel_transactions (which enforces the G18 load-FK invariant) and any subsequent GL
-- posting is a DEFERRED follow-up — see docs/specs/relay-fuel-ingest.md "Held posting follow-up".
--
-- WHY A NEW STAGING SCHEMA (not fuel.fuel_transactions directly): this repo's established pattern for
-- a new external vendor feed is raw-staging-then-project (see integrations.qbo_sync_queue,
-- integrations.samsara_webhook_events) — store the vendor payload faithfully first, resolve/reconcile
-- into canonical tables in a separate, reviewable step. Avoids inventing gallons/load/vendor_id fields
-- fuel.fuel_transactions requires that Relay's schema does not supply directly.
--
-- Tables (schema `integrations`, already grant-covered — USAGE re-asserted defensively below):
--   integrations.relay_fuel_transactions       — one row per Relay transaction_id (top-level fields)
--   integrations.relay_fuel_transaction_lines  — one row per fuel_items[] entry (line items)
-- Plus: mdata.drivers.integration_id (additive column) — the Relay Driver ID / fuel-card number used
-- to match a transaction's driver{} to our driver record (per Jorge's confirmed matching rule).
--
-- Money stored as *_cents integers (Relay returns string dollar amounts; converted at ingest time in
-- the backend service — this migration only defines the column shape).
--
-- Idempotent (CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / DO blocks), atomic, additive-only.

BEGIN;

-- ── 0. mdata.drivers.integration_id — additive column, matches the 0176 samsara_driver_id pattern ──
DO $$
BEGIN
  IF to_regclass('mdata.drivers') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'mdata' AND table_name = 'drivers' AND column_name = 'integration_id'
    ) THEN
      ALTER TABLE mdata.drivers ADD COLUMN integration_id text NULL;
    END IF;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mdata_drivers_company_integration_id
  ON mdata.drivers (operating_company_id, integration_id)
  WHERE integration_id IS NOT NULL;

COMMENT ON COLUMN mdata.drivers.integration_id IS
  'Vendor driver/card identifier used for external ingest matching (Relay Payments Driver ID / fuel-card #). Additive, nullable.';

-- ── 1. integrations schema already exists + is grant-covered; re-assert USAGE defensively ──
GRANT USAGE ON SCHEMA integrations TO ih35_app;

-- ── 2. integrations.relay_fuel_transactions — one row per Relay transaction_id ──
CREATE TABLE IF NOT EXISTS integrations.relay_fuel_transactions (
  id                                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id                uuid NOT NULL REFERENCES org.companies(id),

  -- Relay top-level transaction fields (verbatim names, faithfully stored)
  transaction_id                      text NOT NULL,
  relay_created_at                    timestamptz NOT NULL,
  relay_fuel_code                     text NULL,
  total_amount_paid_cents             bigint NOT NULL,
  total_retail_price_cents            bigint NOT NULL,
  total_amount_saved_cents            bigint NULL,
  is_direct_bill                      boolean NULL,
  currency_code                       text NOT NULL DEFAULT 'USD',
  cash_advance                        boolean NULL,
  fuel_code_type                      text NULL,

  -- linked_org{id,name,number}
  linked_org_id                       text NULL,
  linked_org_name                     text NULL,
  linked_org_number                   text NULL,

  -- driver{id,first_name,last_name,phone,email,integration_id} — verbatim from Relay
  relay_driver_id                     text NULL,
  relay_driver_first_name             text NULL,
  relay_driver_last_name              text NULL,
  relay_driver_phone                  text NULL,
  relay_driver_email                  text NULL,
  relay_driver_integration_id         text NULL,

  -- merchant{id,name,number}
  merchant_id                         text NULL,
  merchant_name                       text NULL,
  merchant_number                     text NULL,

  -- location{id,name,fuel_merchant_location_id,address,city,state,zip_code,latitude,longitude,opis_id,timezone}
  location_id                         text NULL,
  location_name                      text NULL,
  location_fuel_merchant_location_id text NULL,
  location_address                    text NULL,
  location_city                       text NULL,
  location_state                      text NULL,
  location_zip_code                   text NULL,
  location_latitude                   numeric(9,6) NULL,
  location_longitude                  numeric(9,6) NULL,
  location_opis_id                    text NULL,
  location_timezone                   text NULL,

  -- prompts[]{label,value} — faithfully stored (includes the "Truck #" prompt used for unit matching)
  prompts                             jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- fees[] / products[] — top-level arrays whose nested shape is not further specified by the confirmed
  -- schema; stored faithfully as jsonb rather than guessing at phantom columns (see design doc).
  fees                                jsonb NOT NULL DEFAULT '[]'::jsonb,
  products                            jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Read-only match results, resolved at ingest time (never written back to Relay).
  matched_driver_id                   uuid NULL REFERENCES mdata.drivers(id) ON DELETE SET NULL,
  matched_unit_id                     uuid NULL REFERENCES mdata.units(id) ON DELETE SET NULL,
  matched_unit_number                 text NULL,

  -- Full original transaction payload, archived verbatim (evidence-grade; never edited).
  raw_payload                         jsonb NOT NULL,

  ingest_source                       text NOT NULL DEFAULT 'daily_pull'
                                       CHECK (ingest_source IN ('daily_pull', 'webhook')),

  -- HELD posting placeholder — always false here; the fuel->expense/bill/GL projection is the
  -- deferred follow-up (see docs/specs/relay-fuel-ingest.md). Never set true by this ingest path.
  posted_to_gl                        boolean NOT NULL DEFAULT false,

  is_active                           boolean NOT NULL DEFAULT true,
  voided_at                           timestamptz NULL,
  created_at                          timestamptz NOT NULL DEFAULT now(),
  updated_at                          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_relay_fuel_transactions_company_txn
  ON integrations.relay_fuel_transactions (operating_company_id, transaction_id);

CREATE INDEX IF NOT EXISTS idx_relay_fuel_transactions_opco
  ON integrations.relay_fuel_transactions (operating_company_id)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_relay_fuel_transactions_matched_driver
  ON integrations.relay_fuel_transactions (matched_driver_id)
  WHERE matched_driver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_relay_fuel_transactions_matched_unit
  ON integrations.relay_fuel_transactions (matched_unit_id)
  WHERE matched_unit_id IS NOT NULL;

-- ── 3. integrations.relay_fuel_transaction_lines — one row per fuel_items[] entry ──
CREATE TABLE IF NOT EXISTS integrations.relay_fuel_transaction_lines (
  id                                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id                uuid NOT NULL REFERENCES org.companies(id),
  relay_fuel_transaction_id           uuid NOT NULL REFERENCES integrations.relay_fuel_transactions(id) ON DELETE CASCADE,
  line_index                          int NOT NULL,

  fuel_type                           text NULL,
  fuel_type_description                text NULL,
  fuel_product_code                   text NULL,
  retail_price_per_unit_cents         bigint NULL,
  discounted_price_per_unit_cents     bigint NULL,
  volume                              numeric(12,3) NULL,
  volume_uom                          text NULL,
  total_retail_price_cents            bigint NULL,
  total_discounted_price_cents        bigint NULL,
  fee_type                            text NULL,
  fee_amount_cents                    bigint NULL,

  is_active                           boolean NOT NULL DEFAULT true,
  voided_at                           timestamptz NULL,
  created_at                          timestamptz NOT NULL DEFAULT now(),
  updated_at                          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_relay_fuel_transaction_lines_txn_idx
  ON integrations.relay_fuel_transaction_lines (relay_fuel_transaction_id, line_index);

CREATE INDEX IF NOT EXISTS idx_relay_fuel_transaction_lines_opco
  ON integrations.relay_fuel_transaction_lines (operating_company_id)
  WHERE is_active;

-- ── 4. FORCED entity-scoped RLS (canonical predicate) on both new tables ──
ALTER TABLE integrations.relay_fuel_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.relay_fuel_transactions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS relay_fuel_transactions_entity_select ON integrations.relay_fuel_transactions;
DROP POLICY IF EXISTS relay_fuel_transactions_entity_write  ON integrations.relay_fuel_transactions;
CREATE POLICY relay_fuel_transactions_entity_select ON integrations.relay_fuel_transactions FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY relay_fuel_transactions_entity_write ON integrations.relay_fuel_transactions FOR ALL
  USING (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum])))
  WITH CHECK (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum])));

ALTER TABLE integrations.relay_fuel_transaction_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.relay_fuel_transaction_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS relay_fuel_transaction_lines_entity_select ON integrations.relay_fuel_transaction_lines;
DROP POLICY IF EXISTS relay_fuel_transaction_lines_entity_write  ON integrations.relay_fuel_transaction_lines;
CREATE POLICY relay_fuel_transaction_lines_entity_select ON integrations.relay_fuel_transaction_lines FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY relay_fuel_transaction_lines_entity_write ON integrations.relay_fuel_transaction_lines FOR ALL
  USING (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum])))
  WITH CHECK (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum])));

-- ── 5. Grants to ih35_app runtime role. NO DELETE (void-not-delete via is_active/voided_at). ──
-- NOTE: `integrations` carries an ALTER DEFAULT PRIVILEGES grant (from an earlier migration) that
-- auto-grants ih35_app SELECT/INSERT/UPDATE/DELETE on every NEW relation in the schema — verified
-- locally via pg_default_acl (same landmine documented for `dispatch`). A narrow GRANT alone is NOT
-- enough to keep these void-not-delete; explicitly REVOKE DELETE below. Verify via
-- has_table_privilege('ih35_app', '<table>', 'DELETE') = false, not by reading this file.
GRANT SELECT, INSERT, UPDATE ON integrations.relay_fuel_transactions TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON integrations.relay_fuel_transaction_lines TO ih35_app;
REVOKE DELETE ON integrations.relay_fuel_transactions FROM ih35_app;
REVOKE DELETE ON integrations.relay_fuel_transaction_lines FROM ih35_app;

-- ── 6. Default-OFF feature flag — the whole ingest (cron + webhook) is a no-op until Jorge enables it
--       per entity via lib.feature_flag_overrides. See apps/backend/src/lib/feature-flags/service.ts
--       PER_ENTITY_ONLY_FLAG_KEYS (RELAY_FUEL_INGEST_ENABLED enrolled there in the same PR). ──
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES (
  'RELAY_FUEL_INGEST_ENABLED',
  'Relay Payments fuel-transaction ingest (daily pull + webhook), storage ONLY — no GL/expense posting. DEFAULT OFF — owner-gated, per entity.',
  false,
  0
)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;
