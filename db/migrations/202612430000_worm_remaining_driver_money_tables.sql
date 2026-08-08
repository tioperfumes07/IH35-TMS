-- ACCT-F269 — close the rest of the void-not-delete gap on driver money tables.
--
-- Board row LV-VOID-NOT-DELETE-UNENFORCED-ON-DRIVER-FINANCE-AND-BANKING (P0). ACCT-F253
-- (202612390000) hardened the three that were provably zero-risk. These six were left explicitly
-- because application/test code still issues DELETE against them, and I recorded that as the blocker.
--
-- THAT BLOCKER WAS MY OWN MISREADING, and correcting it is the point of this migration. The hardening
-- pattern is PRODUCTION-SCOPED — it returns early unless current_database() = 'neondb'. CI runs against
-- a local ephemeral database, so fixture teardown never sees the trigger or the revoke. Test DELETEs
-- were never in the way; I treated them as blocking without checking that the guard I was copying
-- already excluded them.
--
-- WHAT THESE SIX HOLD, and why they are not peripheral:
--   driver_finance.driver_bills                  driver payables — what the company OWES a driver
--   driver_finance.driver_advances               cash already handed to a driver, awaiting recovery
--   driver_finance.driver_liabilities            the recoverable balance itself
--   driver_finance.driver_deduction_bucket_events the audit of what was deducted and when
--   driver_finance.driver_settlement_gl_bills    the settlement -> GL bridge
--   banking.bank_transaction_splits              how one bank line was apportioned across accounts
--
-- Every one is money or the evidence of money. Under void-not-delete none of them may be destroyed;
-- a row is voided, never removed. Today the runtime role can DELETE them outright.
--
-- DELETE-TRIGGERS ARE NOT PROTECTION — the distinction that made ACCT-F253 necessary. Several of these
-- carry tg_audit_row, which RECORDS a delete; it does not refuse one. Only
-- accounting.refuse_financial_row_delete blocks, and it blocks regardless of the GRANT, which is why
-- both the trigger and the REVOKE are installed together.
--
-- Idempotent: DROP TRIGGER IF EXISTS before CREATE, REVOKE is a no-op when already revoked, absent
-- tables are skipped. Written in the FOREACH-over-ARRAY form so verify-worm-coverage-ratchet (step
-- 1629) can see it — the EXECUTE-format-over-a-scalar variant is invisible to that ratchet, which is
-- protection with nothing watching it (ACCT-F152).

DO $$
DECLARE
  t text;
  v_count int := 0;
BEGIN
  IF current_database() <> 'neondb' THEN
    RAISE NOTICE 'ACCT-F269: database is % (not production) — DELETE-blocking not installed; fixture teardown preserved', current_database();
    RETURN;
  END IF;

  IF to_regprocedure('accounting.refuse_financial_row_delete()') IS NULL THEN
    RAISE EXCEPTION 'ACCT-F269: accounting.refuse_financial_row_delete() is absent — ACCT-F141 (202612220000) must be applied first';
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'driver_finance.driver_bills',
    'driver_finance.driver_advances',
    'driver_finance.driver_liabilities',
    'driver_finance.driver_deduction_bucket_events',
    'driver_finance.driver_settlement_gl_bills',
    'banking.bank_transaction_splits'
  ] LOOP
    IF to_regclass(t) IS NULL THEN
      RAISE NOTICE 'ACCT-F269: % absent — skipped', t;
      CONTINUE;
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON %s', t);
    EXECUTE format(
      'CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON %s FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete()',
      t
    );
    EXECUTE format('REVOKE DELETE ON %s FROM ih35_app', t);
    v_count := v_count + 1;

    RAISE NOTICE 'ACCT-F269: % is now WORM (refuse-trigger + REVOKE DELETE)', t;
  END LOOP;

  RAISE NOTICE 'ACCT-F269: % driver/banking money table(s) hardened', v_count;
END
$$;
