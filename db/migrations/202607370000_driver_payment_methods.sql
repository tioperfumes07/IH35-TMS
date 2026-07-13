-- [HOLD-FOR-JORGE — TIER 1] Driver payment-method master data (canonical driver_finance.*).
-- financial cluster, PROTECTED, gated. NEVER self-merge; owner merges the HOLD PR.
-- DO NOT RUN ON PROD — this migration runs ONLY on a Neon branch by Jorge's hand, then is ledger-backfilled
-- so prod db:migrate skips it (the held-migration firewall + registry enforce this at execution time).
--
-- WHY: the settlement payment path (driver-finance/settlement-payment.service.ts:hasDriverBankToken) probes
-- mdata.drivers for `bank_account_token` / `ach_bank_account_token` / `direct_deposit_token` columns that
-- EXIST NOWHERE — so ACH direct-deposit settlements can never be queued for payment (the probe always
-- returns "not configured"). There is no canonical store of HOW a driver is paid. This adds the missing
-- master-data table (LINKAGE-LAW: driver -> payment method) so the payment path reads a real store.
--
-- Scope = MASTER DATA ONLY. No GL/posting math, no money movement. Tokenized reference + last4 for display;
-- raw routing/account numbers are NEVER stored here. The behavior change on the payment path (ACH becomes
-- possible where it always failed) ships behind DRIVER_PAYMENT_METHODS_ENABLED (default OFF, per-entity) so
-- prod behavior is unchanged until the owner flips it entity-by-entity (verify-then-flip).
--
-- Additive/idempotent (CREATE-only, IF NOT EXISTS). FORCED RLS + 0065 grants. void-not-delete (is_active +
-- voided_at; grants carry no DELETE). Same-entity FK to org.companies / mdata.drivers / identity.users.

BEGIN;

CREATE TABLE IF NOT EXISTS driver_finance.driver_payment_methods (
  id                   uuid NOT NULL DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id            uuid NOT NULL REFERENCES mdata.drivers(id),
  -- SETTLE-PAYRUN EXPAND (2026-07-13): `method` free-text is being REPLACED by payment_method_id -> the
  -- owner-editable catalogs.payment_methods catalog (created in 202607380000). During expand BOTH exist:
  -- `method` is relaxed to NULLABLE (no longer the sole source of truth); payment_method_id (nullable here,
  -- FK added in 202607380000 once the catalog table exists — ordering) is the canonical pointer going forward.
  -- Safe to amend this HELD migration: it has never run on prod (held-migration firewall).
  method               text NULL CHECK (method IS NULL OR method IN ('ach', 'check')),
  payment_method_id    uuid NULL,
  -- opaque tokenized bank reference (from a processor/vault). NEVER a raw account/routing number.
  account_token        text NULL,
  routing_last4        text NULL CHECK (routing_last4 IS NULL OR routing_last4 ~ '^[0-9]{4}$'),
  account_last4        text NULL CHECK (account_last4 IS NULL OR account_last4 ~ '^[0-9]{4}$'),
  account_holder_name  text NULL,
  is_default           boolean NOT NULL DEFAULT false,
  is_active            boolean NOT NULL DEFAULT true,
  voided_at            timestamptz NULL,
  voided_by_user_id    uuid NULL REFERENCES identity.users(id),
  void_reason          text NULL,
  created_by_user_id   uuid NULL REFERENCES identity.users(id),
  updated_by_user_id   uuid NULL REFERENCES identity.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  -- an ACH method must carry a tokenized reference (a check method need not).
  CONSTRAINT driver_payment_methods_ach_requires_token
    CHECK (method <> 'ach' OR account_token IS NOT NULL)
);

-- At most ONE default, active method per driver per entity (the one the pay path uses).
CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_payment_methods_one_default
  ON driver_finance.driver_payment_methods (operating_company_id, driver_id)
  WHERE is_default AND is_active;

-- Lookup by driver (the settlement payment path resolves the driver's default method).
CREATE INDEX IF NOT EXISTS ix_driver_payment_methods_driver
  ON driver_finance.driver_payment_methods (operating_company_id, driver_id) WHERE is_active;

-- updated_at touch on UPDATE.
CREATE OR REPLACE FUNCTION driver_finance.touch_driver_payment_methods_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_driver_payment_methods_updated_at ON driver_finance.driver_payment_methods;
CREATE TRIGGER trg_touch_driver_payment_methods_updated_at
  BEFORE UPDATE ON driver_finance.driver_payment_methods
  FOR EACH ROW EXECUTE FUNCTION driver_finance.touch_driver_payment_methods_updated_at();

-- FORCED RLS + entity-scoped policy (0065 pattern, matches driver_finance.driver_advance_accounts).
ALTER TABLE driver_finance.driver_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.driver_payment_methods FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_payment_methods_tenant_scope ON driver_finance.driver_payment_methods;
CREATE POLICY driver_payment_methods_tenant_scope ON driver_finance.driver_payment_methods
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);

-- Runtime grants (no DELETE — void-not-delete via is_active/voided_at).
GRANT SELECT, INSERT, UPDATE ON driver_finance.driver_payment_methods TO ih35_app;

-- Behavior-change gate: default OFF, per-entity owner-flip only. When OFF the settlement payment path keeps
-- its current behavior (ACH treated as not-configured); when ON it resolves the driver's default method here.
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES (
  'DRIVER_PAYMENT_METHODS_ENABLED',
  'Settlement payment path resolves a driver''s default ACH/check method from '
  || 'driver_finance.driver_payment_methods instead of the (non-existent) mdata.drivers token columns. '
  || 'DEFAULT OFF — per-entity owner-gated; OFF preserves current behavior.',
  false, 0
)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;
