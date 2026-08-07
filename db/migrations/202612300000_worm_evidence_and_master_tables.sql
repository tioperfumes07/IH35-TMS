-- ACCT-F161 — WORM sweep #3: evidence, legal instruments, and the financial master records.
--
-- CONTINUES ACCT-F141 (202612220000) and ACCT-F160 (202612290000). Those covered the LEDGER. This
-- covers the rows that are EVIDENCE — the ones a court, an insurer, an auditor or a factor would ask
-- for — plus the two master records the ledger hangs off.
--
-- MEASURED ON PROD br-fancy-credit-akjnd07a 2026-08-07 (information_schema + pg_trigger, RLS-immune).
-- All six are fully unprotected today: no BEFORE DELETE trigger AND ih35_app may delete.
--
--   driver_finance.signed_acknowledgments   a SIGNED acknowledgment. Deleting one destroys the proof
--                                           of consent that is the entire reason the row exists.
--   factoring.letter_of_release             a legal instrument releasing a receivable.
--   factoring.customer_factor_assignment    carries notice-of-assignment weight.
--   banking.reconciliation_matches          the assertion tying a bank line to a ledger entry.
--   banking.bank_accounts                   deleting one destroys the anchor of every reconciliation.
--   factoring.factor                        the factor master record.
--
-- BLAST RADIUS — measured, not assumed. Across apps/backend/src, excluding __tests__/ and *.test.ts,
-- there are ZERO DELETE statements against any of these six. reconciliation_matches is INSERT-ONLY in
-- application code (2 INSERT, 10 SELECT, 1 JOIN, 0 UPDATE, 0 DELETE) and "un-matching" is already
-- expressed as a match_state value ('rejected'), i.e. it was ALREADY void-not-delete by convention —
-- this migration only makes the convention unbreakable. bank_accounts is already deactivated rather
-- than deleted (it carries deactivated_at + is_active, and the code path writes them).
--
-- ★ THE PART THAT IS NOT A COPY OF ACCT-F160 — WHY §1 EXISTS.
-- Five of the six carry NO void/deactivate column of any kind (verified: only bank_accounts has
-- deactivated_at + is_active). Making a table undeletable when it has no void path does not implement
-- void-not-delete; it implements NEVER-REMOVE-BY-ANY-MEANS, which is a different and worse rule.
-- Concretely: `factoring.factor` and `factoring.customer_factor_assignment` are exactly the rows the
-- PLANNED Faro -> RTS factor migration must retire. WORM without a void path would wall that migration
-- in behind a schema change made under time pressure later.
-- This is the same correction ACCT-F141 made for itself: its §1 added void columns to
-- driver_settlements precisely because "their absence made void-not-delete impossible there."
-- So the void path is added FIRST, in the same migration, and only then is DELETE refused.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / pg_constraint existence checks / DROP TRIGGER IF EXISTS /
-- to_regclass. Reuses accounting.refuse_financial_row_delete() — NO new refusal logic.

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- §1 — the void path, added BEFORE the refusal, for the five tables that have none.
--      Columns are added UNCONDITIONALLY in every environment: they are schema, and every environment
--      needs them. Only the DELETE refusal in §2 is production-scoped.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  c text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'driver_finance.signed_acknowledgments',
    'factoring.letter_of_release',
    'factoring.customer_factor_assignment',
    'factoring.factor',
    'banking.reconciliation_matches'
  ] LOOP
    IF to_regclass(t) IS NULL THEN
      RAISE NOTICE 'ACCT-F161: % absent — void columns skipped', t;
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE %s
         ADD COLUMN IF NOT EXISTS voided_at         timestamptz,
         ADD COLUMN IF NOT EXISTS void_reason       text,
         ADD COLUMN IF NOT EXISTS voided_by_user_id uuid REFERENCES identity.users(id)', t);

    -- A void must say WHY and name WHO. An unexplained void is the same evidentiary hole as a delete,
    -- one step removed — and on THESE tables the evidentiary hole is the whole point. NOT VALID so it
    -- binds new writes without re-validating history.
    c := replace(replace(t, '.', '_'), '"', '') || '_void_reason_required';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = t::regclass AND conname = c
    ) THEN
      -- %L for the empty-string literal: nesting quadruple quotes inside format() inside a
      -- dollar-quoted block is how this kind of migration acquires a syntax error nobody sees until
      -- it runs on prod.
      EXECUTE format(
        'ALTER TABLE %s ADD CONSTRAINT %I CHECK (voided_at IS NULL OR btrim(coalesce(void_reason, %L)) <> %L) NOT VALID',
        t, c, '', '');
    END IF;

    RAISE NOTICE 'ACCT-F161: % now has a void path (voided_at/void_reason/voided_by_user_id)', t;
  END LOOP;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- §2 — refuse DELETE. Production-scoped for ACCT-F141's established reason, not relitigated here:
--      CI connects AS ih35_app, so REVOKE DELETE denies fixture teardown. The control protects REAL
--      evidence; a test database has fixtures, not evidence.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  n int := 0;
BEGIN
  IF current_database() <> 'neondb' THEN
    RAISE NOTICE 'ACCT-F161: database is % (not production) — DELETE-blocking not installed; fixture teardown preserved', current_database();
    RETURN;
  END IF;

  IF to_regprocedure('accounting.refuse_financial_row_delete()') IS NULL THEN
    RAISE EXCEPTION 'ACCT-F161: accounting.refuse_financial_row_delete() is absent — ACCT-F141 (202612220000) must be applied first';
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'driver_finance.signed_acknowledgments',
    'factoring.letter_of_release',
    'factoring.customer_factor_assignment',
    'factoring.factor',
    'banking.reconciliation_matches',
    'banking.bank_accounts'
  ] LOOP
    IF to_regclass(t) IS NULL THEN
      RAISE NOTICE 'ACCT-F161: % absent — skipped', t;
      CONTINUE;
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON %s', t);
    EXECUTE format(
      'CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON %s FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete()',
      t
    );
    EXECUTE format('REVOKE DELETE ON %s FROM ih35_app', t);
    n := n + 1;
    RAISE NOTICE 'ACCT-F161: % is now WORM (trigger + REVOKE DELETE)', t;
  END LOOP;

  RAISE NOTICE 'ACCT-F161: % evidence/master tables are now WORM on %', n, current_database();
END
$$;
