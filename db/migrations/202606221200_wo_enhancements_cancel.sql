-- WO enhancements — render-v5 header gaps + WO Cancel (non-financial) + WO Void columns (Tier-1, flagged OFF).
-- APPROVED by Jorge + GUARD to RUN (review artifact: docs/specs/wo-enhancements-cancel-renderv5-migration.md).
-- Additive, idempotent. GUARD's 2 confirmations, resolved:
--   (1) DRIFT-CAPTURE: catalogs.wo_cancellation_reasons follows the EXACT pattern of catalogs.cancellation_reasons
--       (the load catalog, migration 0101) — a global enum-label catalog with NO audit trigger and NO RLS.
--       Catalog seed tables are exempt from the row audit/drift trigger by convention (0101 has none). So none
--       is added here (matches convention). work_orders Cancel/Void writes ARE captured — work_orders already
--       has audit.ensure_row_trigger attached.
--   (2) GLOBAL CATALOG: wo_cancellation_reasons has no operating_company_id, identical to catalogs.cancellation_reasons
--       — shared UI reason labels, NOT entity-scoped financial data. Acceptable (GUARD-confirmed).
BEGIN;

-- ── (A) render-v5 header gaps ─────────────────────────────────────────────────────────────────────────
ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS authorized_by_user_id uuid NULL REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS authorization_number  text NULL,
  ADD COLUMN IF NOT EXISTS service_location_type text NULL
    CHECK (service_location_type IS NULL OR service_location_type IN ('shop','mobile','roadside')),
  ADD COLUMN IF NOT EXISTS repaired_by           text NULL
    CHECK (repaired_by IS NULL OR repaired_by IN ('in_house','outside_vendor'));

-- ── (B) WO Cancel (non-financial; status is free text → 'cancelled' needs no enum change) ───────────────
ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS cancelled_at         timestamptz NULL,
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id uuid NULL REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS cancel_reason_code   text NULL,
  ADD COLUMN IF NOT EXISTS cancel_notes         text NULL;

-- WO cancellation reasons catalog (global, mirrors catalogs.cancellation_reasons). The cancel route's
-- preValidation validates cancel_reason_code against THIS catalog, NOT a hard-coded enum (the #1335 lesson).
CREATE TABLE IF NOT EXISTS catalogs.wo_cancellation_reasons (
  reason_code             text PRIMARY KEY,
  reason_label            text NOT NULL,
  requires_owner_approval boolean NOT NULL DEFAULT false,
  sort_order              integer NOT NULL DEFAULT 0,
  is_active               boolean NOT NULL DEFAULT true
);
INSERT INTO catalogs.wo_cancellation_reasons (reason_code, reason_label, sort_order) VALUES
  ('DUPLICATE',        'Duplicate',         10),
  ('CREATED_IN_ERROR', 'Created in error',  20),
  ('NOT_NEEDED',       'Not needed',        30),
  ('WRONG_UNIT',       'Wrong unit',        40),
  ('VENDOR_DECLINED',  'Vendor declined',   50),
  ('OTHER',            'Other',             60)
ON CONFLICT (reason_code) DO NOTHING;
GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.wo_cancellation_reasons TO ih35_app;

-- ── (C) WO Void columns (Tier-1; reversing logic ships LATER behind WO_VOID_ENABLED, NOT in this migration) ─
ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS voided_at           timestamptz NULL,
  ADD COLUMN IF NOT EXISTS voided_by_user_id   uuid NULL REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS void_reason_code    text NULL,
  ADD COLUMN IF NOT EXISTS void_notes          text NULL,
  ADD COLUMN IF NOT EXISTS reversing_entry_ref text NULL;

COMMIT;
