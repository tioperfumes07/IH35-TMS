-- DRIVER-ADVANCE-ACCOUNT-LINK — the missing forward/reverse bridge from a driver to their
-- per-driver Cash-Advance ASSET sub-account in catalogs.accounts.
--
-- WHY: on driver hire (mdata/drivers.routes.ts) the system auto-provisions two per-driver
-- sub-accounts — an ASSET "Driver Cash Advance- <Name>" and a LIABILITY per-driver escrow.
-- The ESCROW side already has a bridge (accounting.escrow_accounts, migration 0234). The
-- ASSET (cash-advance) side had NO stored link — the provisioned account id was discarded on
-- hire (an orphan). This table is the symmetric cash-advance bridge so a driver <-> their
-- advance asset account is reachable BOTH directions (driver_id -> coa_account_id, and
-- coa_account_id -> driver_id), mirroring accounting.escrow_accounts.
--
-- One advance account per driver per entity: PRIMARY KEY (operating_company_id, driver_id).
-- Portable, entity-scoped (FORCED RLS, 0065 pattern), void-not-delete (is_active), grants to
-- ih35_app. Idempotent CREATE-only.

BEGIN;

CREATE TABLE IF NOT EXISTS driver_finance.driver_advance_accounts (
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id            uuid NOT NULL REFERENCES mdata.drivers(id),
  coa_account_id       uuid NOT NULL REFERENCES catalogs.accounts(id),
  is_active            boolean NOT NULL DEFAULT true,
  created_by_user_id   uuid NULL REFERENCES identity.users(id),
  updated_by_user_id   uuid NULL REFERENCES identity.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operating_company_id, driver_id)
);

-- Reverse-lookup index: coa_account_id -> driver (the "both directions" requirement).
CREATE INDEX IF NOT EXISTS ix_driver_advance_accounts_coa
  ON driver_finance.driver_advance_accounts (operating_company_id, coa_account_id);

-- updated_at touch on UPDATE (re-point / reactivate).
CREATE OR REPLACE FUNCTION driver_finance.touch_driver_advance_accounts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_driver_advance_accounts_updated_at ON driver_finance.driver_advance_accounts;
CREATE TRIGGER trg_touch_driver_advance_accounts_updated_at
  BEFORE UPDATE ON driver_finance.driver_advance_accounts
  FOR EACH ROW EXECUTE FUNCTION driver_finance.touch_driver_advance_accounts_updated_at();

-- FORCED RLS + entity-scoped policy (0065 pattern, matches driver_finance.driver_pay_settings).
ALTER TABLE driver_finance.driver_advance_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.driver_advance_accounts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_advance_accounts_tenant_scope ON driver_finance.driver_advance_accounts;
CREATE POLICY driver_advance_accounts_tenant_scope ON driver_finance.driver_advance_accounts
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);

-- Runtime grants (no DELETE — void-not-delete via is_active).
GRANT SELECT, INSERT, UPDATE ON driver_finance.driver_advance_accounts TO ih35_app;

COMMIT;
