-- CUSTOMER-FULL-EDIT-SAVE-SILENT-NOOP — pinned via live instrumented reproduction (window.fetch
-- monkeypatch capturing the real "Full Edit" Save button's PATCH, replayed against the correct API
-- host with the exact 55-field payload the form sends).
--
-- ROOT CAUSE: mdata.customers.shipping_country was added `NOT NULL DEFAULT 'US'` by migration
-- 202607110240 (customer_qbo_parity), before the "Shipping same as billing" checkbox feature
-- existed. Every one of its 6 shipping_* sibling columns (shipping_address_line1/line2/city/
-- postal_code/state) is correctly nullable; shipping_country alone was left NOT NULL — an
-- oversight, not a deliberate choice (there is no code path anywhere that treats a missing
-- shipping country as invalid; the form's own `profileValuesToUpdatePayload()` deliberately sends
-- `shipping_country: null` whenever `shipping_same_as_billing` is true, matching how it already
-- treats every other shipping field).
--
-- IMPACT: shipping_same_as_billing defaults to true (NOT NULL DEFAULT true, migration
-- 202607110240), so this affected most/all customers. Every Full Edit Save with "Shipping same as
-- billing" checked threw a raw Postgres 23502 not-null-violation, re-thrown as an uncaught 500 by
-- the PATCH route's catch block (which only special-cases 23505). Live-reproduced 4/4 times against
-- prod via the exact real-form payload before this migration.
--
-- FIX: drop the NOT NULL constraint. Additive, backward-compatible — this can only ALLOW a value
-- (NULL) that was previously rejected; it can never reject anything that worked before. The
-- DEFAULT 'US' is left in place for INSERT paths that don't specify a value at all (unrelated to
-- this bug, no reason to touch it). Idempotent: ALTER COLUMN ... DROP NOT NULL is a no-op if the
-- column is already nullable.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'mdata' AND table_name = 'customers' AND column_name = 'shipping_country'
       AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE mdata.customers ALTER COLUMN shipping_country DROP NOT NULL;
  END IF;
END $$;

COMMIT;
