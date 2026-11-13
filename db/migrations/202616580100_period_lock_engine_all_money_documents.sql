-- ENG-38 PERIOD-LOCK ENGINE (ROUND 8.20). Owner 2026-11-02: build the lock engine, DO NOT lock any period.
-- This migration closes nothing: every USMCA period stays 'open'. It only makes a future close mean what a
-- QuickBooks closing date means — nothing dated on or before the close can be created, changed or deleted.
--
-- ROOT CAUSE (measured live 2026-11-13 01:50Z, pg_trigger):
--   1. Only six tables carry the closed-period refusal: journal_entries, journal_entry_postings, invoices, bills,
--      bill_payments, payments. Expenses, deposits (+ lines), transfers, credit memos, vendor credits, factoring
--      advances / purchases and every document line table have none: after a close, an expense dated in the closed
--      month can still be keyed, edited or deleted, and the posting engine refuses only its JE — the document and
--      its ledger disagree.
--   2. The five header triggers that exist fire only on INSERT and on UPDATE OF <date>: changing the AMOUNT or
--      account of a closed-period invoice, or voiding / deleting it, is not refused; moving a document's date OUT of
--      a closed month is not refused either (only NEW.date is checked).
-- ENGINE: one rule, accounting.raise_if_txn_in_closed_period (unchanged), applied by two generic triggers:
--   accounting.tg_period_lock_doc()  ARGV[0] = the document date column, ARGV[1..] = the money columns.
--     INSERT → NEW date. DELETE → OLD date. UPDATE when the date, company or any money column changes → OLD and NEW.
--     Unrelated updates on a closed document still pass: link and sync stamps, print status, and the status /
--     applied-balance changes a payment in an OPEN period makes to an invoice or bill dated in a closed one
--     (QuickBooks: paying an old invoice after the close is normal; changing what it billed is not).
--   accounting.tg_period_lock_line()  ARGV[0] = parent table, ARGV[1] = FK column, ARGV[2] = parent date column,
--     ARGV[3..] = the line's money columns. INSERT / DELETE of a line, and an UPDATE that moves it to another parent or
--     changes a money column, is refused when the parent's date is in a closed period.
-- Reverse: DROP TRIGGER trg_period_lock_* (the six original triggers are kept, so dropping these restores today).
-- Fresh-DB safe: functions + triggers only, each table skipped with a NOTICE when absent. Reads no rows.
BEGIN;

SET LOCAL search_path TO pg_catalog, public;
SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION accounting.tg_period_lock_doc()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_date_col text := TG_ARGV[0];
  v_old jsonb;
  v_new jsonb;
  v_changed boolean := false;
  i int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    PERFORM accounting.raise_if_txn_in_closed_period((v_new->>'operating_company_id')::uuid, (v_new->>v_date_col)::date);
    RETURN NEW;
  END IF;

  v_old := to_jsonb(OLD);
  IF TG_OP = 'DELETE' THEN
    PERFORM accounting.raise_if_txn_in_closed_period((v_old->>'operating_company_id')::uuid, (v_old->>v_date_col)::date);
    RETURN OLD;
  END IF;

  v_new := to_jsonb(NEW);
  IF (v_old->v_date_col) IS DISTINCT FROM (v_new->v_date_col)
     OR (v_old->'operating_company_id') IS DISTINCT FROM (v_new->'operating_company_id') THEN
    v_changed := true;
  ELSE
    FOR i IN 1 .. TG_NARGS - 1 LOOP
      IF (v_old->TG_ARGV[i]) IS DISTINCT FROM (v_new->TG_ARGV[i]) THEN
        v_changed := true;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  IF v_changed THEN
    PERFORM accounting.raise_if_txn_in_closed_period((v_old->>'operating_company_id')::uuid, (v_old->>v_date_col)::date);
    PERFORM accounting.raise_if_txn_in_closed_period((v_new->>'operating_company_id')::uuid, (v_new->>v_date_col)::date);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION accounting.tg_period_lock_line()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent_table text := TG_ARGV[0];
  v_fk_col text := TG_ARGV[1];
  v_date_col text := TG_ARGV[2];
  v_parent_id uuid;
  v_company uuid;
  v_date date;
  v_pass int;
  v_changed boolean := false;
  i int;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(OLD)->v_fk_col) IS DISTINCT FROM (to_jsonb(NEW)->v_fk_col) THEN
      v_changed := true;
    ELSE
      FOR i IN 3 .. TG_NARGS - 1 LOOP
        IF (to_jsonb(OLD)->TG_ARGV[i]) IS DISTINCT FROM (to_jsonb(NEW)->TG_ARGV[i]) THEN
          v_changed := true;
          EXIT;
        END IF;
      END LOOP;
    END IF;
    IF NOT v_changed THEN
      RETURN NEW;
    END IF;
  END IF;
  -- An UPDATE that moves a line to another parent is checked against both parents.
  FOR v_pass IN 1 .. 2 LOOP
    IF v_pass = 1 THEN
      IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
        v_parent_id := (to_jsonb(OLD)->>v_fk_col)::uuid;
      ELSE
        CONTINUE;
      END IF;
    ELSE
      IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        v_parent_id := (to_jsonb(NEW)->>v_fk_col)::uuid;
      ELSE
        CONTINUE;
      END IF;
    END IF;
    IF v_parent_id IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('SELECT operating_company_id, %I::date FROM %s WHERE id = $1', v_date_col, v_parent_table)
      INTO v_company, v_date USING v_parent_id;
    PERFORM accounting.raise_if_txn_in_closed_period(v_company, v_date);
  END LOOP;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  -- table, date column, money columns (comma list)
  docs text[][] := ARRAY[
    ARRAY['accounting.journal_entries',      'entry_date',         'voided_at'],
    ARRAY['accounting.invoices',             'issue_date',         'total_cents,voided_at'],
    ARRAY['accounting.bills',                'bill_date',          'amount_cents,total_amount,coa_account_id,voided_at'],
    ARRAY['accounting.bill_payments',        'payment_date',       'amount_cents,from_bank_account_id,voided_at'],
    ARRAY['accounting.payments',             'payment_date',       'amount_cents,deposited_to_account_id,voided_at'],
    ARRAY['accounting.expenses',             'transaction_date',   'total_amount_cents,payment_account_uuid,voided_at'],
    ARRAY['accounting.deposits',             'deposit_date',       'amount_deposited_cents,total_receipts_cents,cash_back_cents,bank_account_id,voided_at'],
    ARRAY['banking.transfers',               'transfer_date',      'amount_cents,from_account_id,to_account_id'],
    ARRAY['accounting.credit_memos',         'issue_date',         'amount_cents,account_id,voided_at'],
    ARRAY['accounting.vendor_credits',       'issue_date',         'amount_cents,account_id,voided_at'],
    ARRAY['accounting.factoring_advances',   'faro_purchase_date', 'invoice_total_cents,advance_amount_cents,reserve_amount_cents,factor_fee_cents,voided_at'],
    ARRAY['accounting.factoring_purchases',  'purchase_date',      'gross_cents,advance_cents,fee_cents,net_to_company_cents,voided_at']
  ];
  lines text[][] := ARRAY[
    ARRAY['accounting.invoice_lines', 'accounting.invoices', 'invoice_id', 'issue_date',       'unit_amount_cents,line_total_cents,account_id'],
    ARRAY['accounting.bill_lines',    'accounting.bills',    'bill_id',    'bill_date',        'amount,rate_cents,account_id,voided_at'],
    ARRAY['accounting.expense_lines', 'accounting.expenses', 'expense_id', 'transaction_date', 'amount,amount_cents,rate_cents,expense_account_uuid'],
    ARRAY['accounting.deposit_lines', 'accounting.deposits', 'deposit_id', 'deposit_date',     'amount_cents,account_id']
  ];
  r text[];
  v_tbl text;
  v_trg text;
  v_args text;
  c text;
BEGIN
  FOREACH r SLICE 1 IN ARRAY docs LOOP
    v_tbl := r[1];
    v_trg := 'trg_period_lock_' || split_part(v_tbl, '.', 2);
    IF to_regclass(v_tbl) IS NULL THEN
      RAISE NOTICE '202616580100: % absent — skipped', v_tbl;
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = split_part(v_tbl, '.', 1) AND table_name = split_part(v_tbl, '.', 2)
                      AND column_name = r[2]) THEN
      RAISE NOTICE '202616580100: %.% absent — skipped', v_tbl, r[2];
      CONTINUE;
    END IF;
    v_args := quote_literal(r[2]);
    FOREACH c IN ARRAY string_to_array(r[3], ',') LOOP
      -- only money columns the table really has (fresh DBs and older schemas differ)
      IF EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = split_part(v_tbl, '.', 1) AND table_name = split_part(v_tbl, '.', 2)
                    AND column_name = c) THEN
        v_args := v_args || ', ' || quote_literal(c);
      END IF;
    END LOOP;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', v_trg, v_tbl);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION accounting.tg_period_lock_doc(%s)',
                   v_trg, v_tbl, v_args);
  END LOOP;

  FOREACH r SLICE 1 IN ARRAY lines LOOP
    v_tbl := r[1];
    v_trg := 'trg_period_lock_' || split_part(v_tbl, '.', 2);
    IF to_regclass(v_tbl) IS NULL OR to_regclass(r[2]) IS NULL THEN
      RAISE NOTICE '202616580100: % or % absent — skipped', v_tbl, r[2];
      CONTINUE;
    END IF;
    v_args := quote_literal(r[2]) || ', ' || quote_literal(r[3]) || ', ' || quote_literal(r[4]);
    FOREACH c IN ARRAY string_to_array(r[5], ',') LOOP
      IF EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = split_part(v_tbl, '.', 1) AND table_name = split_part(v_tbl, '.', 2)
                    AND column_name = c) THEN
        v_args := v_args || ', ' || quote_literal(c);
      END IF;
    END LOOP;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', v_trg, v_tbl);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION accounting.tg_period_lock_line(%s)',
                   v_trg, v_tbl, v_args);
  END LOOP;
END;
$$;

COMMIT;
