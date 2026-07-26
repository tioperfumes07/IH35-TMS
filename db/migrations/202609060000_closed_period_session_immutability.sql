-- [HOLD-FOR-JORGE — TIER 1 FINANCIAL] BANK-DOM-02 + ACCT-DOM-03
-- Closed reconciliation-session + closed-period LINE immutability.
--
-- *** DO NOT MERGE WITHOUT JORGE'S EXPLICIT OK. DO NOT RUN ON PROD. ***
-- Run ONLY on a Neon branch by Jorge's hand, then ledger-backfill.
--
-- BANK-DOM-02: a bank_transactions row that belongs to a status='reconciled'
-- reconciliation session must not be re-categorized, un-cleared, amount-changed,
-- or otherwise mutated (QuickBooks / NetSuite reconcile lock).
--
-- ACCT-DOM-03: accounting.journal_entry_postings LINE mutations must honor the
-- same closed-period gate already on JE headers (0183 raise_if_txn_in_closed_period),
-- keyed by the parent journal_entries.entry_date.
--
-- Idempotent / fresh-DB-safe / void-not-delete. No GL math. No feature flag.
-- Posts nothing. Flags stay OFF elsewhere until Jorge flips per entity.

BEGIN;

-- ── BANK-DOM-02: reconciled-session membership + write lock ───────────────────
DO $$
BEGIN
  IF to_regclass('banking.bank_transactions') IS NULL
     OR to_regclass('banking.reconciliation_sessions') IS NULL THEN
    RAISE NOTICE 'closed-session lock: banking tables absent — skipping (clean no-op)';
    RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION banking.txn_is_in_reconciled_session(
    p_txn_id uuid,
    p_company_id uuid
  )
  RETURNS boolean
  LANGUAGE sql
  STABLE
  AS $fn$
    SELECT EXISTS (
      SELECT 1
      FROM banking.bank_transactions bt
      WHERE bt.id = p_txn_id
        AND bt.operating_company_id = p_company_id
        AND (
          EXISTS (
            SELECT 1
            FROM banking.reconciliation_sessions rs
            WHERE rs.id = bt.reconciliation_session_id
              AND rs.operating_company_id = bt.operating_company_id
              AND rs.status = 'reconciled'
          )
          OR EXISTS (
            SELECT 1
            FROM banking.reconciliation_sessions rs
            WHERE rs.bank_account_id = bt.bank_account_id
              AND rs.operating_company_id = bt.operating_company_id
              AND rs.status = 'reconciled'
              AND bt.transaction_date BETWEEN rs.period_start AND rs.period_end
          )
        )
    );
  $fn$;

  CREATE OR REPLACE FUNCTION banking.raise_if_txn_in_reconciled_session(
    p_txn_id uuid,
    p_company_id uuid
  )
  RETURNS void
  LANGUAGE plpgsql
  AS $fn$
  BEGIN
    IF banking.txn_is_in_reconciled_session(p_txn_id, p_company_id) THEN
      RAISE EXCEPTION 'IH35_RECONCILED_SESSION txn_id=% company=% — closed reconciliation session is immutable',
        p_txn_id, p_company_id
        USING ERRCODE = 'P0001';
    END IF;
  END;
  $fn$;

  CREATE OR REPLACE FUNCTION banking.trg_block_reconciled_session_txn_mutation()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  DECLARE
    v_id uuid;
    v_company uuid;
  BEGIN
    IF TG_OP = 'DELETE' THEN
      v_id := OLD.id;
      v_company := OLD.operating_company_id;
    ELSE
      v_id := NEW.id;
      v_company := NEW.operating_company_id;
    END IF;
    -- Allow the complete() path to stamp reconciliation_session_id onto open members.
    IF TG_OP = 'UPDATE'
       AND NEW.reconciliation_session_id IS DISTINCT FROM OLD.reconciliation_session_id
       AND NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.amount_cents IS NOT DISTINCT FROM OLD.amount_cents
       AND NEW.transaction_date IS NOT DISTINCT FROM OLD.transaction_date
       AND NEW.category_kind IS NOT DISTINCT FROM OLD.category_kind
       AND NEW.categorization_gl_account_id IS NOT DISTINCT FROM OLD.categorization_gl_account_id
       AND NEW.coa_account_id IS NOT DISTINCT FROM OLD.coa_account_id
       AND NEW.skip_reason IS NOT DISTINCT FROM OLD.skip_reason
       AND NEW.investigate_note IS NOT DISTINCT FROM OLD.investigate_note
       AND NEW.matched_load_id IS NOT DISTINCT FROM OLD.matched_load_id
       AND NEW.matched_bill_id IS NOT DISTINCT FROM OLD.matched_bill_id
       AND NEW.matched_settlement_id IS NOT DISTINCT FROM OLD.matched_settlement_id
    THEN
      RETURN NEW;
    END IF;
    PERFORM banking.raise_if_txn_in_reconciled_session(v_id, v_company);
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END;
  $fn$;

  DROP TRIGGER IF EXISTS trg_block_reconciled_session_txn_mutation ON banking.bank_transactions;
  CREATE TRIGGER trg_block_reconciled_session_txn_mutation
    BEFORE UPDATE OR DELETE ON banking.bank_transactions
    FOR EACH ROW
    EXECUTE FUNCTION banking.trg_block_reconciled_session_txn_mutation();
END
$$;

-- ── ACCT-DOM-03: JE posting LINE closed-period lock via parent entry_date ─────
DO $$
BEGIN
  IF to_regclass('accounting.journal_entry_postings') IS NULL
     OR to_regclass('accounting.journal_entries') IS NULL
     OR to_regprocedure('accounting.raise_if_txn_in_closed_period(uuid,date)') IS NULL THEN
    RAISE NOTICE 'closed-period line lock: accounting prerequisites absent — skipping (clean no-op)';
    RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION accounting.trg_block_closed_period_journal_entry_postings()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  DECLARE
    v_company uuid;
    v_entry_date date;
    v_je uuid;
  BEGIN
    v_je := COALESCE(NEW.journal_entry_uuid, OLD.journal_entry_uuid);
    SELECT je.operating_company_id, je.entry_date
      INTO v_company, v_entry_date
    FROM accounting.journal_entries je
    WHERE je.id = v_je;
    IF v_company IS NOT NULL AND v_entry_date IS NOT NULL THEN
      PERFORM accounting.raise_if_txn_in_closed_period(v_company, v_entry_date);
    END IF;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END;
  $fn$;

  DROP TRIGGER IF EXISTS trg_block_closed_period_journal_entry_postings
    ON accounting.journal_entry_postings;
  CREATE TRIGGER trg_block_closed_period_journal_entry_postings
    BEFORE INSERT OR UPDATE OR DELETE ON accounting.journal_entry_postings
    FOR EACH ROW
    EXECUTE FUNCTION accounting.trg_block_closed_period_journal_entry_postings();
END
$$;

COMMIT;
