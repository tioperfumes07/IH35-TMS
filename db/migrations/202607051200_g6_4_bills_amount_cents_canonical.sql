-- G6-4: accounting.bills.amount_cents — single canonical integer-cents money representation.
--
-- FINDING (dual money representation + nullable canonical):
--   accounting.bills stores each bill's amount TWICE:
--     • amount_cents  bigint          -- integer cents (canonical in the app write-path)
--     • total_amount  numeric(12,2)   -- dollars (a LOSSY derived mirror = input.amountCents / 100)
--   The app INSERT (apps/backend/src/accounting/bills.service.ts) writes BOTH, deriving
--   total_amount from amount_cents; every read uses COALESCE(amount_cents, ROUND(total_amount*100)),
--   which means historical / externally-created rows may carry ONLY the dollars mirror.
--   amount_cents is NULLABLE, and the existing CHECK (amount_cents > 0) does NOT reject NULL
--   (a CHECK evaluating to NULL is not a violation in Postgres). A bill can therefore persist with
--   a NULL canonical amount and only the dollars mirror set → ambiguity / drift between the two.
--
-- FIX (this migration — SAFE on any DB state; performs NO data mutation):
--   1. Declare amount_cents the single canonical representation and total_amount a DEPRECATED
--      derived mirror, via column COMMENTs.
--   2. Add a presence guard  CHECK (amount_cents IS NOT NULL)  as NOT VALID so it is enforced
--      for every INSERT/UPDATE going forward WITHOUT scanning or failing on any pre-existing NULL
--      row. Making the column truly NOT NULL (and VALIDATE-ing this constraint) requires first
--      backfilling existing NULL rows from total_amount — a money-touching data step that is
--      intentionally NOT performed here. See the owner-gated plan:
--        docs/specs/repairs/REPAIR-G6-4-BILLS-AMOUNT-CENTS-CANONICAL.md
--
-- Idempotent. Additive-only (no column dropped/renamed → schema-parity baseline unchanged).
-- No new grants (accounting.bills is already granted to ih35_app in migration 0090).
-- NOTE: accounting.bill_payments carries the identical (amount_cents + amount) dual pattern; it is
-- documented as a parallel follow-up in the repair doc and intentionally left out of this scoped fix.

BEGIN;

-- 1. Canonical / deprecated documentation ------------------------------------------------------
COMMENT ON COLUMN accounting.bills.amount_cents IS
  'CANONICAL money representation for a bill: gross amount in integer cents (bigint). Single '
  'source of truth — all reads should prefer this column. Enforced non-NULL for new writes by '
  'CHECK bills_amount_cents_present (G6-4).';

COMMENT ON COLUMN accounting.bills.total_amount IS
  'DEPRECATED derived mirror of amount_cents, in dollars (numeric(12,2) = amount_cents / 100). '
  'Retained for backward compatibility only (additive-only rule); do NOT write as an independent '
  'value. Canonical = accounting.bills.amount_cents (G6-4).';

-- 2. Presence guard, NOT VALID (enforces new/updated rows; does not scan or fail existing rows) --
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class      t ON t.oid = c.conrelid
    JOIN pg_namespace  n ON n.oid = t.relnamespace
    WHERE n.nspname = 'accounting'
      AND t.relname = 'bills'
      AND c.conname = 'bills_amount_cents_present'
  ) THEN
    EXECUTE 'ALTER TABLE accounting.bills
             ADD CONSTRAINT bills_amount_cents_present
             CHECK (amount_cents IS NOT NULL) NOT VALID';
  END IF;
END
$$;

COMMIT;
