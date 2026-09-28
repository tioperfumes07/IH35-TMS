-- ROUND 155.18 -- BUG FOUND BY THE --apply-test-run ROLLBACK PROOF, run again after
-- 202614470000 landed: driver_finance.driver_bills (a real table in the purge script's 25-table
-- scope, live-confirmed to carry its own voided_at column) was refused with the generic
-- "WORM: DELETE is refused for every role" -- because it, and every other newly-added table from
-- ROUND 155.18 item 1's scope expansion (accounting.invoices, accounting.bill_lines,
-- dispatch.non_owned_trailers, dispatch.trailer_interchanges, driver_finance.driver_liabilities,
-- driver_finance.driver_settlement_deductions, driver_finance.driver_settlements,
-- driver_finance.settlement_lines, factoring.customer_factor_assignment, fuel.fuel_transactions,
-- integrations.relay_company_cards, legal.contract_instances, maintenance.work_orders,
-- safety.complaints, safety.dot_inspections, safety.hos_violations, safety.incidents,
-- safety.internal_fines, mdata.customer_quality_events, banking.bank_transaction_splits), was never
-- added to the trigger's gated ARRAY at all -- only the original 5-table scope
-- (202614450000) plus the detail tables (202614470000) were listed.
--
-- All 26 tables below were live-confirmed (2026-09-28) to carry their own voided_at column --
-- every one of them is a genuine document-shaped table for this purge's purposes, not a detail
-- table needing the no-voided_at exemption. This migration adds them to the document-shaped gated
-- list; it does not touch the detail-table list from 202614470000 (accounting.
-- journal_entry_postings, expense_lines, factoring_reserve_movements,
-- factoring_default_interest_accruals, factoring_lifecycle_posting_keys,
-- transaction_source_links), which remains a separate, deliberately narrower, no-voided_at-check
-- category.

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

    -- Document-shaped tables (all confirmed live to carry their own voided_at column) -- the
    -- check is unconditional, no exceptions, regardless of role or auth id.
    IF v_table = ANY (
      ARRAY[
        'accounting.expenses',
        'accounting.bills',
        'accounting.bill_lines',
        'accounting.invoices',
        'accounting.factoring_advances',
        'accounting.journal_entries',
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
