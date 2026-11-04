-- 202616390100_settlement_lines_reinstate_columns.sql
-- ACCT-F11098 (owner 11-04 08:30 CT: "make sure the unvoid engine works correctly and places everything where it should
-- go, correct tables, ap, ar, etc. fully wiring").
--
-- WHAT WAS WRONG (measured 2026-11-04 on prod, USMCA): the "SET-24 LINE-DUP" sweep
-- (scripts/ops/void-duplicate-settlement-lines.ts) grouped settlement_lines by (settlement, line_type, description,
-- amount) WITHOUT the load, and voided 105 real per-load lines (69 escrow_contribution $25.00 + 36 extra_pay $25.00, each on
-- a different load from the line it was called a duplicate of; 0 had a same-load twin). The headers (gross_pay,
-- deductions_total, net_pay), the escrow postings (Cr 2100-xx) and accounting.escrow_posting_loads all still carry them, so
-- the statements under-show. driver_finance.settlement_lines had no reinstate columns, so the universal reinstate engine
-- (reinstateDocument) had no settlement_line family and nothing could restore a line with an audit trail.
--
-- THE FIX: the same reinstate columns driver_bills / driver_settlements carry (reinstated_at, reinstate_reason,
-- reinstated_by_user_id, reinstated_from_void_je_id), plus prior_voided_at / prior_void_reason / prior_voided_by_user_id
-- so the void history stays ON THE ROW after a reinstate (the stamp clears voided_at / void_reason so every reader's
-- "is_active AND voided_at IS NULL" predicate sees the line live again). Written only by stampDocumentReinstated
-- (apps/backend/src/accounting/void-document-stamp.service.ts, family settlement_line).
--
-- Schema only. No data in this file. Idempotent. Nullable columns, no default rewrite.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS reinstated_at timestamptz NULL;
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS reinstate_reason text NULL;
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS reinstated_by_user_id uuid NULL REFERENCES identity.users(id);
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS reinstated_from_void_je_id uuid NULL REFERENCES accounting.journal_entries(id);
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS prior_voided_at timestamptz NULL;
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS prior_void_reason text NULL;
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS prior_voided_by_user_id uuid NULL REFERENCES identity.users(id);

-- A reinstate always carries who and why, and the void it undid.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'driver_finance.settlement_lines'::regclass
       AND conname = 'settlement_lines_reinstate_complete'
  ) THEN
    ALTER TABLE driver_finance.settlement_lines
      ADD CONSTRAINT settlement_lines_reinstate_complete CHECK (
        reinstated_at IS NULL
        OR (btrim(coalesce(reinstate_reason, '')) <> '' AND reinstated_by_user_id IS NOT NULL AND prior_voided_at IS NOT NULL)
      );
  END IF;
END $$;

COMMENT ON COLUMN driver_finance.settlement_lines.reinstated_at IS
  'ACCT-F11098: when a voided line was reinstated by reinstateDocument(type settlement_line). NULL = never reinstated.';
COMMENT ON COLUMN driver_finance.settlement_lines.prior_void_reason IS
  'ACCT-F11098: the void_reason the line carried before it was reinstated (void history kept on the row).';

COMMIT;
