-- 202607091600_driver_settlements_reversal_columns.sql
-- [HOLD-FOR-JORGE — TIER 1] VOID-EVERYWHERE — driver_finance.driver_settlements reversal audit columns.
--
-- *** DO NOT RUN ON PROD. Run ONLY on a Neon branch by Jorge's hand, then ledger-backfill so prod
--     db:migrate skips it. ***
--
-- WHY: rolling the shared void/cancel/reverse governance layer (governance.void_cancel_requests +
-- void.service.ts) onto driver settlements needs a row-level audit trail on the settlement itself —
-- WHO reversed it, WHEN, and WHY — mirroring the convention already shipped on
-- driver_finance.driver_settlement_gl_runs (reversed_at/reversed_by_user_id/reversal_reason,
-- migration 202607060900_settlement_bill_payment_posting.sql). driver_finance.driver_settlements
-- (migration 0124) has a 'cancelled' status value already but NO reversal columns — a governed
-- reverse can flip status but could not previously record who/why. Purely additive; no data backfill,
-- no RLS change (table's existing RLS/grants already cover new nullable columns).
--
-- No posting/GL math — the actual GL reversal reuses the existing, already-live
-- settlement-bill-payment-posting.service.ts::reverseSettlementBillPayment (per-load bill +
-- bill_payment reversal via the shared posting-engine reversePostedSourceTransaction, plus a mirrored
-- deduction JE) — that function was previously built but had ZERO route/caller wiring it into any
-- governed or direct flow; this block wires it into governance.void_cancel_requests as the
-- 'driver_settlement' executor (apps/backend/src/governance/void-cancel-executors.ts).
--
-- Idempotent. Reversible (see footer).

BEGIN;

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_settlements') IS NULL THEN
    RAISE NOTICE 'Skipping driver_settlements reversal columns: table missing';
    RETURN;
  END IF;

  ALTER TABLE driver_finance.driver_settlements
    ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
    ADD COLUMN IF NOT EXISTS reversed_by_user_id uuid REFERENCES identity.users(id),
    ADD COLUMN IF NOT EXISTS reversal_reason text;
END $$;

COMMENT ON COLUMN driver_finance.driver_settlements.reversed_at IS
  'VOID-EVERYWHERE: set when a governed void/cancel (governance.void_cancel_requests, entity_type=driver_settlement) reverses this settlement. Mirrors driver_settlement_gl_runs.reversed_at.';
COMMENT ON COLUMN driver_finance.driver_settlements.reversed_by_user_id IS
  'VOID-EVERYWHERE: executor (Owner/Administrator/Accountant) who approved the reversal.';
COMMENT ON COLUMN driver_finance.driver_settlements.reversal_reason IS
  'VOID-EVERYWHERE: required reason recorded on governance.void_cancel_requests, copied here for row-level audit.';

COMMIT;

-- ROLLBACK (manual; forward-only chain otherwise):
-- BEGIN;
--   ALTER TABLE driver_finance.driver_settlements
--     DROP COLUMN IF EXISTS reversal_reason,
--     DROP COLUMN IF EXISTS reversed_by_user_id,
--     DROP COLUMN IF EXISTS reversed_at;
-- COMMIT;
