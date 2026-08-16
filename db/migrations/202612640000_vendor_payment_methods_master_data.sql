-- ACCT-F5322 / ORPH-003 / CLS-ORPHAN-SURFACE — vendors have no canonical store of HOW they are paid.
-- `mdata.vendors`/`VendorDetailPage.tsx` carry contact_email/contact_phone/address only; no
-- ACH/routing/bank-account fields exist anywhere in the schema (verified live: zero columns
-- matching %ach%/%routing%/%bank_account% on any vendor-named table).
--
-- MIRRORS THE EXISTING, DELIBERATE DRIVER PATTERN EXACTLY (driver_finance.driver_payment_methods,
-- 202607370000) rather than inventing new architecture: a dedicated master-data table, TOKENIZED
-- reference only (opaque token from a processor/vault) — this migration NEVER stores a raw bank
-- account or routing number, matching the driver table's own stated design ("raw routing/account
-- numbers are NEVER stored here"). Vendor bank-redirect fraud (a compromised or spoofed vendor
-- payment-detail change) is one of the highest-value fraud vectors against a company the size of
-- this one; storing raw numbers in a plain table would be a real security regression relative to
-- the pattern already established for drivers, not an improvement.
--
-- SCOPE = MASTER DATA ONLY. No GL/posting math, no money movement, no automatic AP payment-run
-- wiring. Same behavior-change discipline as the driver table: ships flag-gated
-- (VENDOR_PAYMENT_METHODS_ENABLED, default OFF, per-entity) so nothing reads or acts on this table
-- until the owner explicitly flips it entity-by-entity.
--
-- Additive/idempotent (CREATE-only, IF NOT EXISTS). FORCED RLS + 0065-pattern grants (no DELETE —
-- void-not-delete via is_active + voided_at). Same-entity FK to org.companies / mdata.vendors /
-- identity.users.

BEGIN;

CREATE TABLE IF NOT EXISTS accounting.vendor_payment_methods (
  id                   uuid NOT NULL DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  vendor_id            uuid NOT NULL REFERENCES mdata.vendors(id),
  method               text NOT NULL CHECK (method IN ('ach', 'check', 'wire')),
  -- opaque tokenized bank reference (from a processor/vault). NEVER a raw account/routing number —
  -- same rule as driver_finance.driver_payment_methods.
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
  -- an ACH or wire method must carry a tokenized reference (a check method need not).
  CONSTRAINT vendor_payment_methods_electronic_requires_token
    CHECK (method NOT IN ('ach', 'wire') OR account_token IS NOT NULL)
);

-- At most ONE default, active method per vendor per entity.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_payment_methods_one_default
  ON accounting.vendor_payment_methods (operating_company_id, vendor_id)
  WHERE is_default AND is_active;

CREATE INDEX IF NOT EXISTS ix_vendor_payment_methods_vendor
  ON accounting.vendor_payment_methods (operating_company_id, vendor_id) WHERE is_active;

CREATE OR REPLACE FUNCTION accounting.touch_vendor_payment_methods_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_vendor_payment_methods_updated_at ON accounting.vendor_payment_methods;
CREATE TRIGGER trg_touch_vendor_payment_methods_updated_at
  BEFORE UPDATE ON accounting.vendor_payment_methods
  FOR EACH ROW EXECUTE FUNCTION accounting.touch_vendor_payment_methods_updated_at();

-- FORCED RLS + entity-scoped policy (0065 pattern, matches driver_finance.driver_payment_methods).
ALTER TABLE accounting.vendor_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.vendor_payment_methods FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendor_payment_methods_tenant_scope ON accounting.vendor_payment_methods;
CREATE POLICY vendor_payment_methods_tenant_scope ON accounting.vendor_payment_methods
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
GRANT SELECT, INSERT, UPDATE ON accounting.vendor_payment_methods TO ih35_app;

-- Append-only WORM audit trail (same trigger the money tables use — ACCT-F178 sweep).
DROP TRIGGER IF EXISTS tg_audit_row_vendor_payment_methods ON accounting.vendor_payment_methods;
CREATE TRIGGER tg_audit_row_vendor_payment_methods
  AFTER INSERT OR UPDATE OR DELETE ON accounting.vendor_payment_methods
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

-- Behavior-change gate: default OFF, per-entity owner-flip only. Until flipped ON, this table exists
-- as real master data with no route/UI/payment-path consumer wired yet.
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES (
  'VENDOR_PAYMENT_METHODS_ENABLED',
  'Enables vendor bank/payment-method master data (accounting.vendor_payment_methods) for read/write '
  || 'via the vendor detail surface. DEFAULT OFF — per-entity owner-gated; OFF means the table exists '
  || 'but nothing reads or writes it yet.',
  false, 0
)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;
