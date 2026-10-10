-- 202615441200_related_party_loan_facility_loc.sql
-- Cursor · Option 1 related-party LOC (claim 202615441200).
--
-- Owner need: CoA 2410 (Owner / Related-Party Loan Payable) and its 2410-00-00N sub-accounts are a
-- running line of credit per related party. Every bank-feed categorization onto that family must leave
-- a loan DOCUMENT on the Loans & Advances register — not a bare bank_categorization JE.
--
-- CHAIN-05 still posts ONE bank_categorization JE (no loan-poster second JE). This migration adds:
--   * accounting.related_party_loan_facilities — one open LOC per (company, 2410-family account)
--   * entry columns facility_id / bank_transaction_id / display_id / document_kind
--   * banking.bank_transactions.matched_related_party_loan_id — reverse pointer (Match/Categorize stamp)
--
-- Additive, idempotent, CREATE-only. No DROP. No existing row rewritten.

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── facilities (running LOC per related-party CoA account) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounting.related_party_loan_facilities (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  -- The 2410 / 2410-00-00N liability account this LOC draws against.
  account_id            uuid NOT NULL REFERENCES catalogs.accounts(id),
  counterparty_name     text,
  relationship          text NOT NULL DEFAULT 'other'
                        CHECK (relationship IN
                          ('owner','spouse','friend','employee','related_company','other')),
  status                text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','closed','reversed')),
  is_active             boolean NOT NULL DEFAULT true,
  deleted_at            timestamptz,
  created_by_user_id    uuid REFERENCES identity.users(id),
  updated_by_user_id    uuid REFERENCES identity.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- One live facility per company + CoA account (the LOC identity).
CREATE UNIQUE INDEX IF NOT EXISTS uq_rpl_facilities_live_account
  ON accounting.related_party_loan_facilities (operating_company_id, account_id)
  WHERE deleted_at IS NULL AND is_active;

CREATE INDEX IF NOT EXISTS idx_rpl_facilities_company_status
  ON accounting.related_party_loan_facilities (operating_company_id, status);

ALTER TABLE accounting.related_party_loan_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.related_party_loan_facilities FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rpl_facilities_select ON accounting.related_party_loan_facilities;
DROP POLICY IF EXISTS rpl_facilities_write  ON accounting.related_party_loan_facilities;
CREATE POLICY rpl_facilities_select ON accounting.related_party_loan_facilities FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY rpl_facilities_write ON accounting.related_party_loan_facilities FOR ALL
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.related_party_loan_facilities TO ih35_app;

-- ── entry columns: facility + bank provenance + display identity ───────────────────────────────────
ALTER TABLE accounting.related_party_loan_entries
  ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES accounting.related_party_loan_facilities(id);
ALTER TABLE accounting.related_party_loan_entries
  ADD COLUMN IF NOT EXISTS bank_transaction_id uuid REFERENCES banking.bank_transactions(id);
ALTER TABLE accounting.related_party_loan_entries
  ADD COLUMN IF NOT EXISTS display_id text;
ALTER TABLE accounting.related_party_loan_entries
  ADD COLUMN IF NOT EXISTS document_kind text;

-- document_kind: funding = money-in draw on the LOC; repayment = money-out paydown; manual = wizard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'related_party_loan_entries_document_kind_check'
      AND conrelid = 'accounting.related_party_loan_entries'::regclass
  ) THEN
    ALTER TABLE accounting.related_party_loan_entries
      ADD CONSTRAINT related_party_loan_entries_document_kind_check
      CHECK (document_kind IS NULL OR document_kind = ANY (ARRAY['funding'::text, 'repayment'::text, 'manual'::text]));
  END IF;
END $$;

-- Extend target_type for bank-categorize fundings (existing rows keep their values).
ALTER TABLE accounting.related_party_loan_entries
  DROP CONSTRAINT IF EXISTS related_party_loan_entries_target_type_check;
ALTER TABLE accounting.related_party_loan_entries
  ADD CONSTRAINT related_party_loan_entries_target_type_check
  CHECK (target_type = ANY (ARRAY[
    'bill'::text, 'settlement'::text, 'cash_advance'::text, 'expense'::text,
    'loan_out'::text, 'repayment'::text, 'intercompany'::text,
    'bank_funding'::text, 'bank_repayment'::text
  ]));

CREATE INDEX IF NOT EXISTS idx_rpl_entries_facility
  ON accounting.related_party_loan_entries (facility_id)
  WHERE facility_id IS NOT NULL;

-- One LIVE funding/repayment document per bank line (void/reverse does not block re-categorize).
CREATE UNIQUE INDEX IF NOT EXISTS uq_rpl_entries_live_bank_transaction
  ON accounting.related_party_loan_entries (operating_company_id, bank_transaction_id)
  WHERE bank_transaction_id IS NOT NULL
    AND deleted_at IS NULL
    AND status IS DISTINCT FROM 'reversed';

CREATE UNIQUE INDEX IF NOT EXISTS uq_rpl_entries_display_id_company
  ON accounting.related_party_loan_entries (operating_company_id, display_id)
  WHERE display_id IS NOT NULL;

-- ── bank line reverse pointer ─────────────────────────────────────────────────────────────────────
ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS matched_related_party_loan_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bank_transactions_matched_related_party_loan_id_fkey'
      AND conrelid = 'banking.bank_transactions'::regclass
  ) THEN
    ALTER TABLE banking.bank_transactions
      ADD CONSTRAINT bank_transactions_matched_related_party_loan_id_fkey
      FOREIGN KEY (matched_related_party_loan_id)
      REFERENCES accounting.related_party_loan_entries (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_bank_transactions_matched_related_party_loan_id
  ON banking.bank_transactions (matched_related_party_loan_id)
  WHERE matched_related_party_loan_id IS NOT NULL;

COMMENT ON COLUMN banking.bank_transactions.matched_related_party_loan_id IS
  'Option 1 LOC: related_party_loan_entries row created when this line was categorized to a 2410-family account. JE is matched_journal_entry_id; this is the document.';

COMMENT ON TABLE accounting.related_party_loan_facilities IS
  'Option 1: one running related-party LOC per CoA 2410-family account. Fundings are related_party_loan_entries rows under the facility.';

-- ── ROUND 368.2 / 360 bank-line functions — restated with matched_related_party_loan_id ───────────
-- Same shape as 202615360000 (deposit): every live definition changed by exactly one item so a
-- loan-stamped categorize line is linked, classified, pointed at, checked for a dead link, released,
-- and priced. CREATE OR REPLACE only — no DROP of functions/triggers.

ALTER TABLE banking.reconciliation_matches DROP CONSTRAINT IF EXISTS reconciliation_matches_ledger_entry_kind_check;
ALTER TABLE banking.reconciliation_matches ADD CONSTRAINT reconciliation_matches_ledger_entry_kind_check
  CHECK (ledger_entry_kind = ANY (ARRAY[
    'payment'::text, 'bill_payment'::text, 'transfer'::text, 'je'::text, 'expense'::text,
    'load'::text, 'bill'::text, 'settlement'::text, 'driver_bill'::text, 'factoring_advance'::text,
    'invoice'::text, 'fuel_transaction'::text, 'relay_fuel'::text, 'advance'::text, 'deposit'::text,
    'related_party_loan'::text
  ]));

CREATE OR REPLACE FUNCTION banking.reconciliation_matched_ledger_amount_cents(p_ledger_entry_kind text, p_ledger_entry_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_amount bigint;
BEGIN
  CASE p_ledger_entry_kind
    WHEN 'payment' THEN
      SELECT amount_cents INTO v_amount FROM accounting.payments WHERE id = p_ledger_entry_id;
    WHEN 'bill_payment' THEN
      SELECT amount_cents INTO v_amount FROM accounting.bill_payments WHERE id = p_ledger_entry_id;
    WHEN 'transfer' THEN
      SELECT amount_cents INTO v_amount FROM banking.transfers WHERE id = p_ledger_entry_id;
    WHEN 'je' THEN
      SELECT SUM(amount_cents) INTO v_amount FROM accounting.journal_entry_postings
       WHERE journal_entry_uuid = p_ledger_entry_id AND debit_or_credit = 'debit';
    WHEN 'expense' THEN
      SELECT total_amount_cents INTO v_amount FROM accounting.expenses WHERE id = p_ledger_entry_id;
    WHEN 'load' THEN
      SELECT rate_total_cents INTO v_amount FROM mdata.loads WHERE id = p_ledger_entry_id;
    WHEN 'bill' THEN
      SELECT amount_cents INTO v_amount FROM accounting.bills WHERE id = p_ledger_entry_id;
    WHEN 'settlement' THEN
      SELECT ROUND(net_pay * 100) INTO v_amount FROM driver_finance.driver_settlements WHERE id = p_ledger_entry_id;
    WHEN 'driver_bill' THEN
      SELECT gross_amount_cents INTO v_amount FROM driver_finance.driver_bills WHERE id = p_ledger_entry_id;
    WHEN 'factoring_advance' THEN
      SELECT advance_amount_cents INTO v_amount FROM accounting.factoring_advances WHERE id = p_ledger_entry_id;
    WHEN 'invoice' THEN
      SELECT total_cents INTO v_amount FROM accounting.invoices WHERE id = p_ledger_entry_id;
    WHEN 'fuel_transaction' THEN
      SELECT ROUND(total_cost * 100) INTO v_amount FROM fuel.fuel_transactions WHERE id = p_ledger_entry_id;
    WHEN 'relay_fuel' THEN
      SELECT total_amount_paid_cents INTO v_amount FROM integrations.relay_fuel_transactions WHERE id = p_ledger_entry_id;
    WHEN 'deposit' THEN
      SELECT amount_deposited_cents INTO v_amount FROM accounting.deposits WHERE id = p_ledger_entry_id;
    WHEN 'related_party_loan' THEN
      SELECT principal_cents INTO v_amount FROM accounting.related_party_loan_entries WHERE id = p_ledger_entry_id;
    WHEN 'advance' THEN
      SELECT amount_cents INTO v_amount FROM driver_finance.driver_advances WHERE id = p_ledger_entry_id;
    ELSE
      RAISE EXCEPTION 'reconciliation_matched_ledger_amount_cents: unhandled ledger_entry_kind "%" -- every value in the reconciliation_matches CHECK constraint must be handled here, never silently fall through', p_ledger_entry_kind
        USING ERRCODE = 'check_violation';
  END CASE;
  RETURN v_amount;
END;
$function$;

CREATE OR REPLACE FUNCTION banking.refuse_bank_line_matched_to_nothing()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_voided timestamptz;
  v_dead text;
BEGIN
  SELECT voided_at INTO v_voided FROM banking.bank_transactions WHERE id = NEW.id;
  IF NOT FOUND OR v_voided IS NOT NULL THEN
    RETURN NULL;
  END IF;
  IF EXISTS (
       SELECT 1 FROM banking.bank_transactions bt
        WHERE bt.id = NEW.id
          AND NOT (num_nonnulls(bt.matched_advance_id, bt.matched_bill_id, bt.matched_bill_payment_id, bt.matched_expense_id,
                                bt.matched_factoring_advance_id, bt.matched_fuel_transaction_id, bt.matched_invoice_id,
                                bt.matched_journal_entry_id, bt.matched_load_id, bt.matched_payment_id,
                                bt.matched_relay_fuel_transaction_id, bt.matched_settlement_id, bt.matched_transfer_id,
                                bt.matched_deposit_id, bt.matched_related_party_loan_id,
                                bt.linked_entity_id) > 0
                   OR bt.status IN ('split', 'transfer') OR bt.transfer_kind IS NOT NULL))
     AND EXISTS (
       SELECT 1 FROM banking.reconciliation_matches m
        WHERE m.bank_transaction_id = NEW.id AND m.voided_at IS NULL AND m.match_state IN ('auto_matched', 'user_matched'))
  THEN
    RAISE EXCEPTION 'bank line % was released but still holds a live match row', NEW.id
      USING ERRCODE = 'check_violation',
            HINT = 'Unmatch retires the line''s live match rows (voided, rejected) in the same transaction (ROUND 368.2(b)).';
  END IF;
  v_dead := banking.bank_line_dead_link(NEW.id);
  IF v_dead IS NOT NULL THEN
    RAISE EXCEPTION 'bank line % is matched to nothing: % names a document that is missing or no longer live', NEW.id, v_dead
      USING ERRCODE = 'check_violation',
            HINT = 'Release the line through the bank-line state machine (Undo / Unmatch) in the same transaction that voids its document (ROUND 368.2(b)).';
  END IF;
  RETURN NULL;
END
$function$;

CREATE OR REPLACE FUNCTION banking.bank_line_classify()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_linked boolean;
  v_excluded boolean;
  v_kind text;
BEGIN
  v_linked := num_nonnulls(
                NEW.matched_advance_id, NEW.matched_bill_id, NEW.matched_bill_payment_id, NEW.matched_expense_id,
                NEW.matched_factoring_advance_id, NEW.matched_fuel_transaction_id, NEW.matched_invoice_id,
                NEW.matched_journal_entry_id, NEW.matched_load_id, NEW.matched_payment_id,
                NEW.matched_relay_fuel_transaction_id, NEW.matched_settlement_id, NEW.matched_transfer_id,
                NEW.matched_deposit_id, NEW.matched_related_party_loan_id,
                NEW.linked_entity_id) > 0
              OR NEW.status IN ('split', 'transfer')
              OR NEW.transfer_kind IS NOT NULL;
  v_excluded := NEW.excluded_reason IS NOT NULL OR NEW.skip_reason IS NOT NULL OR NEW.status = 'skipped'
                OR (NEW.review_state = 'excluded'
                    AND (TG_OP = 'INSERT' OR OLD.review_state IS DISTINCT FROM 'excluded' OR OLD.review_bucket IS NULL));
  IF v_excluded AND NEW.excluded_reason IS NULL AND NEW.skip_reason IS NULL AND NEW.status IS DISTINCT FROM 'skipped' THEN
    NEW.excluded_reason := 'excluded';
  END IF;

  IF v_linked THEN
    IF TG_OP = 'UPDATE' AND NEW.resolution_kind IS NOT NULL AND NEW.resolution_kind IS DISTINCT FROM OLD.resolution_kind THEN
      v_kind := NEW.resolution_kind;
    ELSIF TG_OP = 'UPDATE' AND OLD.review_bucket = 'categorized' AND OLD.resolution_kind IS NOT NULL THEN
      v_kind := OLD.resolution_kind;
    ELSE
      v_kind := CASE
        WHEN NEW.matched_transfer_id IS NOT NULL OR NEW.transfer_kind IS NOT NULL OR NEW.status = 'transfer' THEN 'transfer'
        WHEN NEW.status = 'split' THEN 'split'
        WHEN NEW.status = 'categorized' OR NEW.categorization_gl_account_id IS NOT NULL OR NEW.coa_account_id IS NOT NULL THEN 'added'
        ELSE 'matched'
      END;
    END IF;
    NEW.review_bucket := 'categorized';
    NEW.resolution_kind := v_kind;
    NEW.review_state := 'matched';
  ELSIF v_excluded THEN
    NEW.review_bucket := 'excluded';
    NEW.resolution_kind := NULL;
    NEW.review_state := 'excluded';
  ELSE
    NEW.review_bucket := 'for_review';
    NEW.resolution_kind := NULL;
    NEW.review_state := 'for_review';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION banking.bank_line_match_pointers(p jsonb)
 RETURNS TABLE(kind text, ledger_entry_id uuid)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT m.kind, (p ->> m.col)::uuid
    FROM (VALUES ('matched_load_id', 'load'), ('matched_bill_id', 'bill'), ('matched_settlement_id', 'settlement'),
                 ('matched_expense_id', 'expense'), ('matched_transfer_id', 'transfer'), ('matched_payment_id', 'payment'),
                 ('matched_bill_payment_id', 'bill_payment'), ('matched_journal_entry_id', 'je'),
                 ('matched_factoring_advance_id', 'factoring_advance'), ('matched_invoice_id', 'invoice'),
                 ('matched_fuel_transaction_id', 'fuel_transaction'), ('matched_relay_fuel_transaction_id', 'relay_fuel'),
                 ('matched_advance_id', 'advance'), ('matched_deposit_id', 'deposit'),
                 ('matched_related_party_loan_id', 'related_party_loan')) AS m(col, kind)
   WHERE p ->> m.col IS NOT NULL
$function$;

CREATE OR REPLACE FUNCTION banking.bank_line_dead_link(p_line_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT CASE
    WHEN bt.matched_bill_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting.bills d WHERE d.id = bt.matched_bill_id AND d.voided_at IS NULL AND d.revoked_at IS NULL) THEN 'matched_bill_id'
    WHEN bt.matched_bill_payment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting.bill_payments d WHERE d.id = bt.matched_bill_payment_id AND d.voided_at IS NULL AND d.revoked_at IS NULL) THEN 'matched_bill_payment_id'
    WHEN bt.matched_expense_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting.expenses d WHERE d.id = bt.matched_expense_id AND d.voided_at IS NULL) THEN 'matched_expense_id'
    WHEN bt.matched_payment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting.payments d WHERE d.id = bt.matched_payment_id AND d.voided_at IS NULL) THEN 'matched_payment_id'
    WHEN bt.matched_invoice_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting.invoices d WHERE d.id = bt.matched_invoice_id AND d.voided_at IS NULL) THEN 'matched_invoice_id'
    WHEN bt.matched_transfer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM banking.transfers d WHERE d.id = bt.matched_transfer_id AND d.revoked_at IS NULL) THEN 'matched_transfer_id'
    WHEN bt.matched_journal_entry_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting.journal_entries d WHERE d.id = bt.matched_journal_entry_id AND d.status = 'posted' AND d.reversed_by_je_id IS NULL AND d.voided_at IS NULL) THEN 'matched_journal_entry_id'
    WHEN bt.matched_load_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mdata.loads d WHERE d.id = bt.matched_load_id AND d.voided_at IS NULL AND d.soft_deleted_at IS NULL) THEN 'matched_load_id'
    WHEN bt.matched_settlement_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM driver_finance.driver_settlements d WHERE d.id = bt.matched_settlement_id AND d.voided_at IS NULL) THEN 'matched_settlement_id'
    WHEN bt.matched_advance_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM driver_finance.driver_advances d WHERE d.id = bt.matched_advance_id AND d.voided_at IS NULL) THEN 'matched_advance_id'
    WHEN bt.matched_factoring_advance_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting.factoring_advances d WHERE d.id = bt.matched_factoring_advance_id AND d.voided_at IS NULL) THEN 'matched_factoring_advance_id'
    WHEN bt.matched_fuel_transaction_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM fuel.fuel_transactions d WHERE d.id = bt.matched_fuel_transaction_id AND d.voided_at IS NULL) THEN 'matched_fuel_transaction_id'
    WHEN bt.matched_relay_fuel_transaction_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM integrations.relay_fuel_transactions d WHERE d.id = bt.matched_relay_fuel_transaction_id AND d.voided_at IS NULL) THEN 'matched_relay_fuel_transaction_id'
    WHEN bt.matched_deposit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting.deposits d WHERE d.id = bt.matched_deposit_id AND d.voided_at IS NULL) THEN 'matched_deposit_id'
    WHEN bt.matched_related_party_loan_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM accounting.related_party_loan_entries d
       WHERE d.id = bt.matched_related_party_loan_id
         AND d.deleted_at IS NULL
         AND d.status IS DISTINCT FROM 'reversed'
    ) THEN 'matched_related_party_loan_id'
  END
  FROM banking.bank_transactions bt
  WHERE bt.id = p_line_id
$function$;

CREATE OR REPLACE FUNCTION banking.refuse_live_match_row_on_released_line()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_state text;
  v_row_voided timestamptz;
  v_line_ok boolean;
BEGIN
  SELECT match_state, voided_at INTO v_state, v_row_voided FROM banking.reconciliation_matches WHERE id = NEW.id;
  IF NOT FOUND OR v_row_voided IS NOT NULL OR v_state NOT IN ('auto_matched', 'user_matched') THEN
    RETURN NULL;
  END IF;
  SELECT bt.voided_at IS NULL
         AND (num_nonnulls(bt.matched_advance_id, bt.matched_bill_id, bt.matched_bill_payment_id, bt.matched_expense_id,
                           bt.matched_factoring_advance_id, bt.matched_fuel_transaction_id, bt.matched_invoice_id,
                           bt.matched_journal_entry_id, bt.matched_load_id, bt.matched_payment_id,
                           bt.matched_relay_fuel_transaction_id, bt.matched_settlement_id, bt.matched_transfer_id,
                           bt.matched_deposit_id, bt.matched_related_party_loan_id,
                           bt.linked_entity_id) > 0
              OR bt.status IN ('split', 'transfer') OR bt.transfer_kind IS NOT NULL)
    INTO v_line_ok
    FROM banking.bank_transactions bt WHERE bt.id = NEW.bank_transaction_id;
  IF NOT COALESCE(v_line_ok, false) THEN
    RAISE EXCEPTION 'live match row % (% %) sits on bank line % which carries no document', NEW.id, NEW.ledger_entry_kind, NEW.ledger_entry_id, NEW.bank_transaction_id
      USING ERRCODE = 'check_violation',
            HINT = 'Unmatch retires the row (voided, rejected) in the same transaction it releases the line (ROUND 368.2(b)).';
  END IF;
  RETURN NULL;
END
$function$;

-- ── fail closed: tables + FORCE RLS + bypass branch ───────────────────────────────────────────────
DO $$
DECLARE v_missing int;
BEGIN
  IF to_regclass('accounting.related_party_loan_facilities') IS NULL THEN
    RAISE EXCEPTION '202615441200: related_party_loan_facilities not created';
  END IF;

  SELECT count(*) INTO v_missing
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'accounting'
    AND c.relname = 'related_party_loan_facilities'
    AND NOT (c.relrowsecurity AND c.relforcerowsecurity);
  IF v_missing > 0 THEN
    RAISE EXCEPTION '202615441200: related_party_loan_facilities missing FORCE ROW LEVEL SECURITY';
  END IF;

  SELECT count(*) INTO v_missing
  FROM pg_policies
  WHERE schemaname = 'accounting'
    AND tablename = 'related_party_loan_facilities'
    AND coalesce(qual, '') NOT LIKE '%is_lucia_bypass%';
  IF v_missing > 0 THEN
    RAISE EXCEPTION '202615441200: facilities policy(ies) lack is_lucia_bypass() branch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'banking' AND table_name = 'bank_transactions'
      AND column_name = 'matched_related_party_loan_id'
  ) THEN
    RAISE EXCEPTION '202615441200: matched_related_party_loan_id missing on bank_transactions';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'banking' AND p.proname = 'bank_line_match_pointers'
      AND pg_get_functiondef(p.oid) LIKE '%matched_related_party_loan_id%'
  ) THEN
    RAISE EXCEPTION '202615441200: bank_line_match_pointers missing matched_related_party_loan_id';
  END IF;
END $$;

COMMIT;
