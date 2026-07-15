-- [HOLD-FOR-JORGE — FINANCIAL] Phase-1c — correct driver_finance.driver_settlements.approval_status to the
-- HEADER approval vocabulary (needs_review/approved/finalized). Fixes Phase-1b (202607440000) which wrongly
-- used the LINE vocabulary (pending/approved/rejected) — finalizeSettlement SETs 'finalized' and would violate
-- the old CHECK. 0-row table; idempotent. Verified vs settlement.settlement CHECK + ApprovalStatus TS type.
BEGIN;
ALTER TABLE driver_finance.driver_settlements ALTER COLUMN approval_status DROP DEFAULT;
ALTER TABLE driver_finance.driver_settlements DROP CONSTRAINT IF EXISTS driver_settlements_approval_status_check;
ALTER TABLE driver_finance.driver_settlements ALTER COLUMN approval_status SET DEFAULT 'needs_review';
ALTER TABLE driver_finance.driver_settlements
  ADD CONSTRAINT driver_settlements_approval_status_check
  CHECK (approval_status IN ('needs_review','approved','finalized'));
COMMIT;
