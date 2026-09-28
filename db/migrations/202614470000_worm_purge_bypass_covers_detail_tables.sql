-- ROUND 155.18 -- BUG FOUND BY THE --apply-test-run ROLLBACK PROOF (2026-09-28), run against the
-- REAL hardened trigger from 202614450000 after it was live on prod: the purge script's own
-- reversal-closure delete of accounting.journal_entry_postings was refused by the trigger with
-- "row is NOT voided" -- because journal_entry_postings has NO voided_at column at all (it is a
-- detail/evidence row, not a top-level document). The same gap applies to every other detail table
-- the purge script's CHILD_TABLES map touches: accounting.expense_lines,
-- accounting.factoring_reserve_movements, accounting.factoring_default_interest_accruals,
-- accounting.factoring_lifecycle_posting_keys, accounting.transaction_source_links -- none of them
-- carry voided_at, confirmed live. (accounting.bill_lines and banking.bank_transaction_splits DO
-- carry voided_at and are unaffected -- they keep the normal document-style check.)
--
-- Also: none of these detail tables were even in the original migration's gated ARRAY at all, so
-- any of them with actual rows to delete would have hit the generic "WORM: DELETE is refused for
-- every role" branch, not just the voided_at branch -- confirmed by the fact that
-- accounting.expense_lines had 0 rows in the test run (so its own gap never fired) while
-- accounting.journal_entry_postings, which DID have rows, hit exactly this.
--
-- FIX: for a table with no voided_at column at all, the purge_auth_id gate alone is sufficient (the
-- calling script is trusted to only reach these tables via an already-voided-and-verified parent
-- document, per its own CHILD_TABLES/expandJeClosure logic) -- this migration does NOT relax
-- anything for a table that DOES carry voided_at; that check stays absolute, no exceptions, exactly
-- as 202614450000 already enforces.

CREATE OR REPLACE FUNCTION accounting.refuse_financial_row_delete()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  v_auth_id text;
  v_table text;
BEGIN
  v_auth_id := NULLIF(current_setting('app.purge_auth_id', true), '');
  v_table := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;

  IF v_auth_id ~ '^AUTH-[0-9]+$' THEN
    -- Detail/evidence tables with NO voided_at column of their own -- the purge_auth_id gate alone
    -- is sufficient; there is no voided_at to check. These only exist as children of a document
    -- already verified voided by the calling script.
    IF v_table = ANY (
      ARRAY[
        'accounting.journal_entry_postings',
        'accounting.expense_lines',
        'accounting.factoring_reserve_movements',
        'accounting.factoring_default_interest_accruals',
        'accounting.factoring_lifecycle_posting_keys',
        'accounting.transaction_source_links'
      ]
    ) THEN
      RETURN OLD;
    END IF;

    -- Document-shaped tables (including detail tables that DO carry their own voided_at, like
    -- accounting.bill_lines and banking.bank_transaction_splits) -- voided_at IS NOT NULL is
    -- unconditional, no exceptions, regardless of role or auth id.
    IF v_table = ANY (
      ARRAY[
        'accounting.expenses',
        'accounting.bills',
        'accounting.bill_lines',
        'accounting.factoring_advances',
        'accounting.journal_entries',
        'banking.bank_transactions',
        'banking.bank_transaction_splits'
      ]
    ) THEN
      IF (to_jsonb(OLD) ->> 'voided_at') IS NULL THEN
        RAISE EXCEPTION
          '%.% row % is NOT voided -- the purge bypass (auth %) never applies to a live document, no exceptions, regardless of role.',
          TG_TABLE_SCHEMA, TG_TABLE_NAME, COALESCE(to_jsonb(OLD) ->> 'id', to_jsonb(OLD) ->> 'uuid', '?'), v_auth_id
          USING ERRCODE = 'restrict_violation';
      END IF;
      RETURN OLD;
    END IF;
  END IF;

  RAISE EXCEPTION
    '%.% is WORM: DELETE is refused for every role. Financial rows are never deleted -- void or reverse the document instead, or set app.purge_auth_id to an OPEN AUTH-NNN for an explicitly authorized voided-row purge.',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END $fn$;
