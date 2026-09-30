-- 202614710000_worm_settlement_line_item_splits.sql
--
-- verify-worm-coverage-ratchet FAIL: driver_finance.settlement_line_item_splits (added
-- 202614680000, G2's permanent item-mapping table) is a financial-schema table with no WORM
-- delete-protection, pushing unprotected-financial-table count 89 -> 90. This table is exactly
-- the shape WORM exists for: a permanent, append-only audit record of which real item each
-- settlement-line dollar was reclassified to -- deleting a row here would silently make a signed,
-- closed settlement's own item composition unexplainable again, the precise defect G2 closed.
--
-- FORM MATTERS: written in the FOREACH-over-ARRAY shape verify-worm-coverage-ratchet's parser
-- recognises (see 202612390000's own header comment for why the scalar EXECUTE form is invisible
-- to it). PRODUCTION-SCOPED per ACCT-F141/F161/F195 -- a test database holds fixtures, not
-- evidence. Additive and idempotent.

DO $$
DECLARE
  t text;
BEGIN
  IF current_database() <> 'neondb' THEN
    RAISE NOTICE 'ACCT-F253: database is % (not production) — DELETE-blocking not installed; fixture teardown preserved', current_database();
    RETURN;
  END IF;

  IF to_regprocedure('accounting.refuse_financial_row_delete()') IS NULL THEN
    RAISE EXCEPTION 'ACCT-F253: accounting.refuse_financial_row_delete() is absent — ACCT-F141 (202612220000) must be applied first';
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'driver_finance.settlement_line_item_splits'
  ] LOOP
    IF to_regclass(t) IS NULL THEN
      RAISE NOTICE 'ACCT-F253: % absent — skipped', t;
      CONTINUE;
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON %s', t);
    EXECUTE format(
      'CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON %s FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete()',
      t
    );
    EXECUTE format('REVOKE DELETE ON %s FROM ih35_app', t);

    RAISE NOTICE 'ACCT-F253: % is now WORM (refuse-trigger + REVOKE DELETE)', t;
  END LOOP;
END
$$;
