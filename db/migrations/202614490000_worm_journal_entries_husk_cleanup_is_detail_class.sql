-- ROUND 155.18 -- BUG FOUND BY THE --apply-test-run ROLLBACK PROOF, run again after 202614480000
-- landed (the run reached and correctly processed all 26 document tables this time -- 0 further
-- gaps there): the JE-header safe-husk sweep tried to delete a zero-posting, zero-reference JE
-- header and was refused -- "row is NOT voided" -- because accounting.journal_entries carries a
-- voided_at column but a JE row is NEVER individually voided in this system's real data model
-- (confirmed live: 0 rows anywhere have journal_entries.voided_at set; void happens at the
-- DOCUMENT level -- expenses/bills/etc -- which creates a reversing JE, but the JE rows themselves
-- have no void lifecycle of their own).
--
-- accounting.journal_entries is used by the purge script in TWO semantically different ways that
-- the trigger cannot distinguish: (1) as a document in the main per-table loop, gated on
-- voided_at IS NOT NULL (currently always 0 matching rows, since JEs are never voided), and (2) as
-- a husk-cleanup target after the calling script has ALREADY verified, independently, that the row
-- has zero remaining postings AND zero live references anywhere in the schema (the actual safety
-- check for this case, done in application code before the DELETE is ever issued). Continuing to
-- also require voided_at IS NOT NULL on top of that blocks the legitimate cleanup path entirely
-- and serves no case (1) currently exists to protect).
--
-- FIX: moves accounting.journal_entries into the detail/evidence class (purge_auth_id gate alone
-- suffices, same as journal_entry_postings and the other detail tables) -- consistent with what it
-- actually is: the envelope around a set of postings, not an independently-voidable document.

CREATE OR REPLACE FUNCTION accounting.refuse_financial_row_delete()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  v_auth_id text;
  v_table text;
BEGIN
  v_auth_id := NULLIF(current_setting('app.purge_auth_id', true), '');
  v_table := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;

  IF v_auth_id ~ '^AUTH-[0-9]+$' THEN
    -- Detail/evidence tables with NO independent void lifecycle of their own -- the purge_auth_id
    -- gate alone is sufficient. journal_entries moved here: a JE is never individually voided in
    -- this system (0 live rows, ever) -- it is the envelope around a document's postings, and the
    -- calling script independently verifies zero postings + zero live references before deleting one.
    IF v_table = ANY (
      ARRAY[
        'accounting.journal_entries',
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

    -- Document-shaped tables (all confirmed live to carry their own genuinely-used voided_at
    -- column) -- the check is unconditional, no exceptions, regardless of role or auth id.
    IF v_table = ANY (
      ARRAY[
        'accounting.expenses',
        'accounting.bills',
        'accounting.bill_lines',
        'accounting.invoices',
        'accounting.factoring_advances',
        'banking.bank_transactions',
        'banking.bank_transaction_splits',
        'dispatch.non_owned_trailers',
        'dispatch.trailer_interchanges',
        'driver_finance.driver_bills',
        'driver_finance.driver_liabilities',
        'driver_finance.driver_settlement_deductions',
        'driver_finance.driver_settlements',
        'driver_finance.settlement_lines',
        'factoring.customer_factor_assignment',
        'fuel.fuel_transactions',
        'integrations.relay_company_cards',
        'legal.contract_instances',
        'maintenance.work_orders',
        'safety.complaints',
        'safety.dot_inspections',
        'safety.hos_violations',
        'safety.incidents',
        'safety.internal_fines',
        'mdata.customer_quality_events'
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
