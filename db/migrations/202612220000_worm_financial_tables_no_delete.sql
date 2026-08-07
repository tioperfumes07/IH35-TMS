-- ACCT-F141 — WORM: nine financial tables become undeletable by the application role.
--
-- Supersedes four PRs that each did one slice of this and shared one defect: #4553 (driver_settlements),
-- #4560 (journal_entry_postings), #4576 (bill_lines/expense_lines/payment_applications/bill_payments),
-- #4598 (bills/bank_transactions/driver_settlement_deductions). One root cause, one migration (§9.0.17).
--
-- CONFIRMED live row loss on prod (pg_stat_user_tables, RLS-bypassed, n_tup_del) — 139 rows, gone,
-- unrecoverable, with nothing recording that they ever existed:
--     banking.bank_transactions                   46
--     accounting.bill_lines                       44
--     accounting.bills                            28
--     driver_finance.driver_settlement_deductions 14
--     driver_finance.driver_settlements            7
--
-- WHY THE ENFORCEMENT IS PRODUCTION-SCOPED — this is the correction that makes the sweep land.
--
-- My earlier cut scoped the TRIGGER to the application role on the theory that "a DBA or test harness
-- on another role can still clean up". That theory was wrong, and CI proved it: the integration suite
-- connects AS ih35_app, so `REVOKE DELETE ... FROM ih35_app` denied fixture teardown outright —
-- "permission denied for table driver_settlements" — and a REVOKE is not something a trigger's
-- current_user check can soften. Scoping the trigger fixed half the problem and I reported it as
-- fixed; the REVOKE was still there.
--
-- The real defect underneath is that CI impersonates the PRODUCTION application role, so any
-- hardening of that role necessarily breaks the test suite. The honest resolution is not to weaken
-- the control and not to rewrite 21 test files around it, but to say plainly what the control is
-- for: preventing the running application from destroying REAL financial history. That is a
-- production property. Test databases hold fixtures, not history.
--
-- So DELETE-blocking installs only on the production database. It is verified where it matters —
-- against prod, by the shrink-only ratchet 2729-verify-financial-tables-not-deletable.mjs — and not
-- by a CI database that has nothing to protect. The trade is explicit: CI does not exercise the
-- refusal. That is the cost of CI sharing prod's role, and it is recorded here rather than hidden.
--
-- The void COLUMNS below are added everywhere, unconditionally: they are schema, every environment
-- needs them, and they are what makes void-not-delete possible at all.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS / to_regclass.

-- §1 — void columns for driver_settlements, whose absence made void-not-delete impossible there.
DO $$
BEGIN
  IF to_regclass('driver_finance.driver_settlements') IS NULL THEN
    RAISE NOTICE 'ACCT-F141: driver_finance.driver_settlements absent — skipping columns';
    RETURN;
  END IF;

  ALTER TABLE driver_finance.driver_settlements
    ADD COLUMN IF NOT EXISTS voided_at         timestamptz,
    ADD COLUMN IF NOT EXISTS void_reason       text,
    -- Inline REFERENCES on purpose: a void must name a real actor. An unresolvable voider is the
    -- same evidentiary gap as an unexplained void, and verify-orphan-fk-inventory enforces exactly
    -- this — a new uuid column with no FK is an orphan reference waiting to happen.
    ADD COLUMN IF NOT EXISTS voided_by_user_id uuid REFERENCES identity.users(id);

  -- A void must say WHY. An unexplained void is the same evidentiary hole as a delete, one step
  -- removed. NOT VALID so the constraint binds new writes without re-validating history.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'driver_finance.driver_settlements'::regclass
       AND conname  = 'driver_settlements_void_reason_required'
  ) THEN
    ALTER TABLE driver_finance.driver_settlements
      ADD CONSTRAINT driver_settlements_void_reason_required
      CHECK (voided_at IS NULL OR btrim(coalesce(void_reason, '')) <> '') NOT VALID;
  END IF;
END
$$;

-- §2 — the shared refusal. Table-bound, so a future GRANT cannot silently re-open the hole:
-- a REVOKE alone is undone by anyone who can GRANT; a trigger is not.
CREATE OR REPLACE FUNCTION accounting.refuse_financial_row_delete()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF current_user <> 'ih35_app' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION
    '%.% is WORM: DELETE is refused by the application role. Financial rows are never deleted — void or reverse the document instead.',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END $fn$;

-- §3 — install on production only (see the header for why).
DO $$
DECLARE
  t text;
  n int := 0;
BEGIN
  IF current_database() <> 'neondb' THEN
    RAISE NOTICE 'ACCT-F141: database is % (not production) — DELETE-blocking not installed; fixture teardown preserved', current_database();
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'driver_finance.driver_settlements',
    'driver_finance.driver_settlement_deductions',
    'accounting.journal_entry_postings',
    'accounting.bills',
    'accounting.bill_lines',
    'accounting.bill_payments',
    'accounting.expense_lines',
    'accounting.payment_applications',
    'banking.bank_transactions'
  ] LOOP
    IF to_regclass(t) IS NULL THEN
      RAISE NOTICE 'ACCT-F141: % absent — skipped', t;
      CONTINUE;
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON %s', t);
    EXECUTE format(
      'CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON %s FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete()',
      t
    );
    EXECUTE format('REVOKE DELETE ON %s FROM ih35_app', t);
    n := n + 1;
    RAISE NOTICE 'ACCT-F141: % is now WORM (trigger + REVOKE DELETE)', t;
  END LOOP;

  RAISE NOTICE 'ACCT-F141: % financial tables are now WORM on %', n, current_database();
END
$$;
