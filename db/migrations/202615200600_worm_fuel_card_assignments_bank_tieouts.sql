-- 202615200600_worm_fuel_card_assignments_bank_tieouts.sql
-- ROUND 321 item 1 (Lead): the canonical WORM delete refusal (accounting.refuse_financial_row_delete) as
-- trg_worm_refuse_delete -- the same shape as 202615170400 (driver_finance.feed_intakes) -- on two financial tables that
-- shipped without it and pushed verify-worm-coverage-ratchet backwards (89 -> 90) for every seat:
--   fuel.fuel_card_assignments  (CC-2, 202615140600 -- its own no-delete trigger stays; this adds the canonical one)
--   banking.bank_account_tieouts (202615180200 -- also flagged by verify-new-financial-table-ships-worm; no code path deletes
--                                  a tieout row, measured by repo grep; void-not-delete)
-- Additive, idempotent.
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON fuel.fuel_card_assignments;
CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON fuel.fuel_card_assignments
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();
DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON banking.bank_account_tieouts;
CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON banking.bank_account_tieouts
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();
COMMIT;
