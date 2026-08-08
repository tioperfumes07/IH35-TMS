-- ACCT-F253 (board card CLS-FINANCIAL-TABLE-DELETABLE) — close the next slice of the WORM gap, and
-- correct the card's headline in the process.
--
-- THE CARD SAYS: "REVOKE DELETE on driver_finance.* and banking.*". Measured live on prod
-- br-fancy-credit-akjnd07a 2026-08-08 before writing anything, and that instruction is BOTH overstated
-- and understated:
--
--   · 46 tables across the two schemas still grant DELETE to ih35_app. Of those, 18 ALREADY carry a
--     BLOCKING trigger (accounting.refuse_financial_row_delete / prevent_driver_settlement_deletion),
--     which refuses the delete regardless of the GRANT. The card's two sharpest examples —
--     driver_finance.escrow_ledger (driver money held in trust) and signed_acknowledgments (legal
--     evidence) — are in that protected 18. They were already safe.
--   · 28 are genuinely unprotected. That is the real gap, and it is smaller and more specific than
--     "everything in two schemas".
--   · A BLANKET REVOKE WOULD BE AN OUTAGE, not a hardening — the same conclusion ACCT-F195 reached.
--     driver_finance.trip_link_queue is a QUEUE and drains by delete; transaction_categories,
--     escrow_settings, driver_pay_settings, settlement_contract_terms_config and
--     intercompany_entity_pairs are owner-editable config, not financial records.
--
-- CC-3's counter-claim on the card — "delete-triggers RECORD rather than BLOCK" — is CORRECT for the
-- tables below and worth stating: four of these five already carry a delete trigger, yet DELETE still
-- succeeds, because those triggers are audit writers, not the refuse function. Trigger presence is not
-- protection; the refuse function is. That distinction is why this migration checks for the function
-- by name rather than for "a trigger".
--
-- SCOPED TO WHAT IS PROVABLY ZERO-RISK. Every table below satisfies all three, verified on prod:
--   (a) it holds money or legal evidence,
--   (b) NOTHING deletes it — no application code and no test teardown (grepped apps/backend/src for
--       `DELETE FROM driver_finance.<table>`; zero hits including __tests__),
--   (c) n_tup_del = 0 lifetime and n_live_tup is 0 or 1.
-- So this cannot break an existing flow and cannot strand data. As ACCT-F195 put it: the cheapest
-- moment to make a financial log immutable is before it fills.
--
--   driver_reimbursements       — money owed back to a driver   (had only tg_audit_row: records, never blocks)
--   driver_escrow_separations   — escrow release schedule; escrow is money held IN TRUST (NO delete trigger at all)
--   abandonment_chargebacks     — money charged back against a driver (had only tg_audit_row)
--
-- CORRECTION TO MY OWN FIRST COUNT, recorded because the method matters more than the number: I first
-- measured "28 unprotected" and drafted this migration over FIVE tables, including
-- cash_advance_request_audit and cash_advance_owner_approval_audit. That was WRONG. My probe recognised
-- only two blocker functions by name (refuse_financial_row_delete, prevent_driver_settlement_deletion),
-- and those two tables are in fact protected by `block_cash_adv_*_mutate` — real BEFORE DELETE blockers
-- under a different name. worm-coverage-baseline.json already listed them as protected and the BASELINE
-- WAS RIGHT; my classification was not. Both were dropped from this migration. The lesson generalises:
-- enumerating protection by a hardcoded list of function names undercounts it, so the real unprotected
-- set across driver_finance/banking is SMALLER than 28 and every member needs its trigger read, not its
-- absence assumed.
--
-- DELIBERATELY EXCLUDED, so the next agent does not think they were missed: driver_bills,
-- driver_advances, driver_liabilities, driver_deduction_bucket_events, driver_settlement_gl_bills and
-- banking.bank_transaction_splits are all money-bearing and all still unprotected — but test teardown
-- DELETEs them today. Hardening them requires converting that teardown first, which is a separate
-- change with a real blast radius. Filed on the board rather than smuggled in here.
--
-- PRODUCTION-SCOPED for the reason established by ACCT-F141/F161/F195 and not relitigated: a test
-- database holds fixtures, not evidence. Additive and idempotent — DROP TRIGGER IF EXISTS before
-- CREATE, REVOKE is a no-op when already revoked, absent tables are skipped.

-- FORM MATTERS: verify-worm-coverage-ratchet (step 1629) reads WORM coverage out of the migrations and
-- recognises exactly two shapes — a literal `CREATE TRIGGER ... BEFORE DELETE ON <schema>.<table>`, or
-- this FOREACH-over-ARRAY loop. Written in the ARRAY form so the existing ratchet picks it up and the
-- coverage number actually moves. A functionally identical `EXECUTE format()` over a scalar variable is
-- INVISIBLE to that ratchet — protection with nothing watching it, which is the failure ACCT-F152 built
-- the ratchet to end.
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
    'driver_finance.driver_reimbursements',
    'driver_finance.driver_escrow_separations',
    'driver_finance.abandonment_chargebacks'
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
