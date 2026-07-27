-- [HOLD-FOR-JORGE — TIER 1] DO NOT RUN ON PROD — run ONLY on a Neon branch by Jorge's hand, then
-- ledger-backfill so prod db:migrate skips it. Registered in db/migrations/.held-migrations.json.
--
-- C9 — vendor account_number + bill class_id for Quick Create / Vendor Bill round-trip.
-- Additive, idempotent, nullable. No GL math. No QBO write-back.

BEGIN;

ALTER TABLE mdata.vendors
  ADD COLUMN IF NOT EXISTS account_number text NULL;

COMMENT ON COLUMN mdata.vendors.account_number IS
  'Vendor account number (QBO parity). Optional free-text identifier on the vendor profile.';

ALTER TABLE accounting.bills
  ADD COLUMN IF NOT EXISTS class_id uuid NULL;

DO $$
BEGIN
  IF to_regclass('catalogs.classes') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'bills_class_id_fkey'
        AND conrelid = 'accounting.bills'::regclass
    ) THEN
      ALTER TABLE accounting.bills
        ADD CONSTRAINT bills_class_id_fkey
        FOREIGN KEY (class_id) REFERENCES catalogs.classes(id);
    END IF;
  END IF;
END $$;

COMMENT ON COLUMN accounting.bills.class_id IS
  'QBO Class reporting dimension on the bill header (catalogs.classes). Nullable.';

COMMIT;
