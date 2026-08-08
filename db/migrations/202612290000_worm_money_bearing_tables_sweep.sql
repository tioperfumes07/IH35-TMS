-- ACCT-F160 — WORM sweep #2: every money-bearing financial table becomes undeletable by the app role.
--
-- CONTINUES ACCT-F141 (202612220000), which protected NINE tables and is correct in every respect
-- except one: it HAND-ENUMERATES its table list. That enumeration is the class defect. A financial
-- table added afterwards lands unprotected, silently, and nothing says so — which is exactly what
-- happened, and is why this file exists rather than a third one-off slice.
--
-- MEASURED ON PROD br-fancy-credit-akjnd07a, 2026-08-07 (pg_class + pg_trigger + information_schema,
-- RLS-immune, counting ANY row-level BEFORE DELETE trigger rather than one trigger NAME — the first
-- pass searched only for `trg_worm_refuse_delete` and undercounted by 3, because escrow_postings and
-- the two cash-advance audit tables carry their own differently-named refusal triggers from 0234 /
-- 0131 / 0135. Re-measured before writing anything):
--
--     financial tables (accounting, driver_finance, banking, factoring) .... 141
--     ... with a BEFORE DELETE trigger ...................................... 15
--     ... with DELETE already revoked from ih35_app ......................... 93
--     ... FULLY unprotected (no trigger AND the app role may delete) ........ 47
--
-- Of those 47, this migration takes the ones that record a MONEY EVENT — the objective predicate
-- "carries a numeric amount / _cents / balance / debit / credit / total column", plus
-- accounting.journal_entries, which that predicate MISSES and must not: its amounts live on
-- journal_entry_postings, which ACCT-F141 already made WORM. Today the GL DETAIL is undeletable while
-- the GL HEADER is not. A deletable header over protected lines is not a smaller version of the same
-- control; it is a hole shaped exactly like the one ACCT-F141 closed.
--
-- BLAST RADIUS — measured, and it is what makes a single sweep safe rather than reckless. Across all
-- of apps/backend/src, excluding __tests__/ and *.test.ts, there is exactly ONE DELETE against these
-- four schemas:
--     apps/backend/src/factoring/bank-match.service.ts:117 -> factoring.bank_match_suggestion
-- That table is a match-PROPOSAL cache (0 rows), legitimately churned, and is deliberately NOT in the
-- list below. The only other three source matches are TESTS asserting DELETE is *not* used. So no
-- production code path loses a capability here. Every other DELETE in the tree is fixture teardown,
-- which is why enforcement stays production-scoped (below).
--
-- EXCLUDED, each with a reason — this list is short on purpose, and every entry is a judgment that
-- should be arguable rather than silent:
--   • factoring.bank_match_suggestion  — proposal cache; the one live DELETE in the codebase.
--   • accounting.banking_rules         — categorization CONFIG, not a money event; edited and removed
--                                        by users as rules change.
--   • banking.bank_accounts            — MASTER data, not a transaction. It should almost certainly be
--                                        void-only too, but that is a master-data decision with a UI
--                                        consequence, and folding it into a ledger sweep would be
--                                        deciding it by accident. Filed to the board instead.
--
-- PRODUCTION-SCOPED, for the reason ACCT-F141 established and this file does not relitigate: CI
-- connects AS ih35_app, so REVOKE DELETE denies fixture teardown outright. The control protects REAL
-- financial history; a test database has fixtures, not history. The trade is that CI does not
-- exercise the refusal — it is verified by verify-worm-coverage-ratchet.mjs (static, on the migration)
-- and by a live prod read. Named here rather than hidden.
--
-- Reuses accounting.refuse_financial_row_delete() from ACCT-F141. NO new refusal logic.
-- Idempotent: to_regclass + DROP TRIGGER IF EXISTS + re-runnable REVOKE.

DO $$
DECLARE
  t text;
  n int := 0;
  skipped int := 0;
BEGIN
  IF current_database() <> 'neondb' THEN
    RAISE NOTICE 'ACCT-F160: database is % (not production) — DELETE-blocking not installed; fixture teardown preserved', current_database();
    RETURN;
  END IF;

  IF to_regprocedure('accounting.refuse_financial_row_delete()') IS NULL THEN
    RAISE EXCEPTION 'ACCT-F160: accounting.refuse_financial_row_delete() is absent — ACCT-F141 (202612220000) must be applied first';
  END IF;

  FOREACH t IN ARRAY ARRAY[
    -- A/R and A/P documents
    'accounting.invoices',
    'accounting.invoice_lines',
    'accounting.payments',
    'accounting.vendor_credits',
    'accounting.credit_memos',
    'accounting.bill_unit_allocation',
    -- the GL header whose detail is already WORM
    'accounting.journal_entries',
    -- related-party lending
    'accounting.related_party_loan_entries',
    'accounting.related_party_loan_schedule',
    -- banking money movement
    'banking.transfers',
    'banking.reconciliation_sessions',
    'banking.equipment_loans',
    'banking.equipment_loan_payments',
    'banking.equipment_loan_attributions',
    -- driver money
    'driver_finance.settlement_lines',
    'driver_finance.team_settlement_splits',
    'driver_finance.driver_settlement_disputes',
    'driver_finance.escrow_ledger',
    'driver_finance.escrow_balances',
    'driver_finance.escrow_deductions_pending',
    -- factoring
    'factoring.batch',
    'factoring.reserve_movement'
  ] LOOP
    IF to_regclass(t) IS NULL THEN
      RAISE NOTICE 'ACCT-F160: % absent — skipped', t;
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON %s', t);
    EXECUTE format(
      'CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON %s FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete()',
      t
    );
    EXECUTE format('REVOKE DELETE ON %s FROM ih35_app', t);
    n := n + 1;
    RAISE NOTICE 'ACCT-F160: % is now WORM (trigger + REVOKE DELETE)', t;
  END LOOP;

  RAISE NOTICE 'ACCT-F160: % financial tables newly WORM on % (% absent)', n, current_database(), skipped;
END
$$;
