-- ACCT-F5759 — LV-MONEY-TABLES-HAVE-NO-AUDIT-TRIGGER: a re-verification pass found the board's own
-- "100% coverage across accounting/banking/driver_finance/factoring" claim (PR #13276/ACCT-F5677) had
-- undercounted using an overly narrow trigger-name pattern (`tg_audit_row%`) that missed the
-- `trg_audit_<table>` naming convention most tables actually use. Re-measured with the broader pattern
-- and found true coverage is high but not complete: `driver_finance.abandonment_chargebacks` and
-- `driver_finance.settlement_disputes` — both real money tables (towing_cost_cents,
-- deadhead_cost_cents, replacement_driver_premium_cents, other_recovery_cost_cents,
-- total_chargeback_cents, claimed_adjustment_cents, adjustment_cents) — genuinely have no audit
-- trigger of any name. Both are currently 0 live rows (unexercised paths), so this closes the gap
-- before any real row is ever written to either table.
--
-- Additive only: attaches the SAME reused `audit.tg_audit_row()` function 111+ other tables already
-- use (no new audit machinery). Idempotent (CREATE TRIGGER IF NOT EXISTS pattern via DO $$ guard).

BEGIN;

DO $$
BEGIN
  IF to_regclass('driver_finance.abandonment_chargebacks') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'driver_finance.abandonment_chargebacks'::regclass
        AND tgname = 'trg_audit_abandonment_chargebacks'
        AND NOT tgisinternal
    ) THEN
      CREATE TRIGGER trg_audit_abandonment_chargebacks
        AFTER INSERT OR UPDATE OR DELETE ON driver_finance.abandonment_chargebacks
        FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
    END IF;
  ELSE
    RAISE NOTICE 'ACCT-F5759: driver_finance.abandonment_chargebacks absent — skip';
  END IF;

  IF to_regclass('driver_finance.settlement_disputes') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'driver_finance.settlement_disputes'::regclass
        AND tgname = 'trg_audit_settlement_disputes'
        AND NOT tgisinternal
    ) THEN
      CREATE TRIGGER trg_audit_settlement_disputes
        AFTER INSERT OR UPDATE OR DELETE ON driver_finance.settlement_disputes
        FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
    END IF;
  ELSE
    RAISE NOTICE 'ACCT-F5759: driver_finance.settlement_disputes absent — skip';
  END IF;
END
$$;

COMMIT;
