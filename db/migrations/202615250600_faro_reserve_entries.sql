-- 202615250600_faro_reserve_entries.sql
-- Lead 2026-10-02 (00-LEAD-APPROVAL-2026-10-02-FARO-REPORTS-ARE-THE-BANK-FEED-BUILD-IT.md): "each Faro report is the bank
-- feed for its account; every report line becomes a bank line on that register and posts only when matched or
-- categorized in Banking." Approved lifecycle: "Build the factoring-side posters ... they post what a matched movement says."
--
-- 1. accounting.faro_reserve_entries — ONE document row per line of Faro's "Escrow Reserve Entries" (register 'escrow',
--    GL 1230) or "Cash Reserve Entries" (register 'cash', GL 1235) report: Faro's own ID, invoice number (Inv), PO ref,
--    debtor, payment ref, note, date, signed amount and running balance, as printed, plus the parsed kind. It is the
--    document every reserve posting stamps (source_transaction_type 'faro_reserve_entry'), so the per-customer reserve
--    joins entry -> invoice -> customer. Idempotent: one row per (company, register, Faro ID or '--', date, amount, note,
--    occurrence) — re-importing a report adds nothing.
-- 2. factoring_purchase_lines.faro_invoice_number — Faro's Inv for the purchased invoice (Faro numbers its own invoices
--    001, 002, ...; nothing on our side carried it — measured: PO Ref# resolves 8 of 135 escrow rows, 3 of them to the
--    wrong debtor). Captured when the owner closes the purchase; may be filled once later on a posted line (NULL -> value
--    only, money columns untouched). Unique per company among live lines.
-- 3. Role intercompany_receivable_ih35_transportation -> 8000 "Inter-company - IH35 Transportation" (USMCA) — Client
--    Payable "USMCA Reserve to IH 35 Reserve" is a due-from-affiliate receivable, never income or cost.

BEGIN;

ALTER TABLE accounting.factoring_purchase_lines ADD COLUMN IF NOT EXISTS faro_invoice_number text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_factoring_purchase_lines_faro_invoice_number
  ON accounting.factoring_purchase_lines (operating_company_id, faro_invoice_number)
  WHERE voided_at IS NULL AND faro_invoice_number IS NOT NULL;

CREATE OR REPLACE FUNCTION accounting.fn_factoring_purchase_lines_frozen_when_posted() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
  SELECT status INTO st FROM accounting.factoring_purchases WHERE id = COALESCE(NEW.purchase_id, OLD.purchase_id);
  IF st = 'posted' AND NOT (
       (TG_OP = 'UPDATE' AND OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL
         AND NEW.gross_cents = OLD.gross_cents AND NEW.escrow_reserve_cents = OLD.escrow_reserve_cents
         AND NEW.cash_reserve_cents = OLD.cash_reserve_cents AND NEW.fee_cents = OLD.fee_cents AND NEW.invoice_id = OLD.invoice_id)
       OR
       -- 202615250600: Faro's invoice number may be recorded once on a posted line; nothing else may change with it.
       (TG_OP = 'UPDATE' AND OLD.faro_invoice_number IS NULL AND NEW.faro_invoice_number IS NOT NULL
         AND NEW.voided_at IS NOT DISTINCT FROM OLD.voided_at
         AND NEW.gross_cents = OLD.gross_cents AND NEW.escrow_reserve_cents = OLD.escrow_reserve_cents
         AND NEW.cash_reserve_cents = OLD.cash_reserve_cents AND NEW.fee_cents = OLD.fee_cents
         AND NEW.invoice_id = OLD.invoice_id AND NEW.customer_id = OLD.customer_id
         AND NEW.load_id IS NOT DISTINCT FROM OLD.load_id AND NEW.purchase_id = OLD.purchase_id)
     ) THEN
    RAISE EXCEPTION 'factoring_purchase_line_frozen: purchase is posted -- void it to change a line' USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TABLE IF NOT EXISTS accounting.faro_reserve_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  register text NOT NULL CHECK (register IN ('escrow', 'cash')),
  bank_account_id uuid NOT NULL REFERENCES banking.bank_accounts(id),
  entry_kind text NOT NULL CHECK (entry_kind IN ('escrow_held', 'escrow_to_cash', 'schedule_fee', 'short_pay', 'rsv_deposit', 'client_payable')),
  faro_entry_id text,
  entry_date date NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents <> 0),
  running_balance_cents bigint,
  faro_invoice_number text,
  po_ref text,
  debtor_name text,
  pmt_ref text,
  note text NOT NULL,
  occurrence integer NOT NULL DEFAULT 1 CHECK (occurrence >= 1),
  -- Short-pay lines ("Balance: 4000.00 :: Paid: 3750 :: 250.00 to Rsv"): parsed, never guessed.
  short_pay_balance_cents bigint,
  short_pay_paid_cents bigint,
  -- Client Payable / Rsv Deposit routed to IH 35 TRANSPORTATION (notes name it): due-from-affiliate, USMCA side only.
  counterparty text CHECK (counterparty IS NULL OR counterparty IN ('ih35_transportation')),
  bank_transaction_id uuid REFERENCES banking.bank_transactions(id),
  journal_entry_id uuid REFERENCES accounting.journal_entries(id),
  posted_at timestamptz,
  posted_by_user_id uuid REFERENCES identity.users(id),
  import_batch_ref text NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT faro_reserve_entries_kind_register CHECK (
    (register = 'escrow' AND entry_kind IN ('escrow_held', 'escrow_to_cash'))
    OR (register = 'cash' AND entry_kind IN ('escrow_to_cash', 'schedule_fee', 'short_pay', 'rsv_deposit', 'client_payable'))
  ),
  CONSTRAINT faro_reserve_entries_sign CHECK (
    (entry_kind = 'escrow_held' AND amount_cents > 0)
    OR (entry_kind = 'escrow_to_cash' AND ((register = 'escrow' AND amount_cents < 0) OR (register = 'cash' AND amount_cents > 0)))
    OR (entry_kind IN ('schedule_fee', 'short_pay', 'client_payable') AND amount_cents < 0)
    OR (entry_kind = 'rsv_deposit' AND amount_cents > 0)
  ),
  CONSTRAINT faro_reserve_entries_posted_stamped CHECK ((posted_at IS NULL) = (posted_by_user_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_faro_reserve_entries_identity
  ON accounting.faro_reserve_entries (operating_company_id, register, COALESCE(faro_entry_id, '--'), entry_date, amount_cents, note, occurrence);
CREATE UNIQUE INDEX IF NOT EXISTS uq_faro_reserve_entries_bank_line
  ON accounting.faro_reserve_entries (bank_transaction_id) WHERE bank_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS faro_reserve_entries_faro_inv_idx ON accounting.faro_reserve_entries (operating_company_id, faro_invoice_number);
CREATE INDEX IF NOT EXISTS faro_reserve_entries_je_idx ON accounting.faro_reserve_entries (journal_entry_id);

-- Same entity: the register is a bank account of the entry's company.
CREATE OR REPLACE FUNCTION accounting.faro_reserve_entry_same_entity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM banking.bank_accounts b WHERE b.id = NEW.bank_account_id AND b.operating_company_id = NEW.operating_company_id) THEN
    RAISE EXCEPTION 'faro_reserve_entry: register % is not in company %', NEW.bank_account_id, NEW.operating_company_id;
  END IF;
  IF NEW.bank_transaction_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM banking.bank_transactions t WHERE t.id = NEW.bank_transaction_id AND t.bank_account_id = NEW.bank_account_id
  ) THEN
    RAISE EXCEPTION 'faro_reserve_entry: bank line % is not on register %', NEW.bank_transaction_id, NEW.bank_account_id;
  END IF;
  -- The printed report never changes after import; only the posting stamps move.
  IF TG_OP = 'UPDATE' AND (NEW.register, NEW.entry_kind, NEW.faro_entry_id, NEW.entry_date, NEW.amount_cents, NEW.note, NEW.occurrence,
       NEW.faro_invoice_number, NEW.bank_account_id) IS DISTINCT FROM
       (OLD.register, OLD.entry_kind, OLD.faro_entry_id, OLD.entry_date, OLD.amount_cents, OLD.note, OLD.occurrence,
       OLD.faro_invoice_number, OLD.bank_account_id) THEN
    RAISE EXCEPTION 'faro_reserve_entry: % is Faro''s printed line — it never changes', OLD.id;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.journal_entry_id IS NOT NULL AND NEW.journal_entry_id IS DISTINCT FROM OLD.journal_entry_id THEN
    RAISE EXCEPTION 'faro_reserve_entry: % is posted — reverse its journal entry, never re-point it', OLD.id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_faro_reserve_entry_same_entity ON accounting.faro_reserve_entries;
CREATE TRIGGER trg_faro_reserve_entry_same_entity BEFORE INSERT OR UPDATE ON accounting.faro_reserve_entries
  FOR EACH ROW EXECUTE FUNCTION accounting.faro_reserve_entry_same_entity();

DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON accounting.faro_reserve_entries;
CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.faro_reserve_entries
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();
DROP TRIGGER IF EXISTS tg_audit_row_faro_reserve_entries ON accounting.faro_reserve_entries;
CREATE TRIGGER tg_audit_row_faro_reserve_entries AFTER INSERT OR UPDATE OR DELETE ON accounting.faro_reserve_entries
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

ALTER TABLE accounting.faro_reserve_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.faro_reserve_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS faro_reserve_entries_company_isolation ON accounting.faro_reserve_entries;
CREATE POLICY faro_reserve_entries_company_isolation ON accounting.faro_reserve_entries
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON accounting.faro_reserve_entries TO ih35_app;

-- Allow the new role in the roles CHECK (same idiom as 202615220800: read the current list, add, re-create).
DO $$
DECLARE def text; roles text[];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def FROM pg_constraint c
   WHERE c.conname = 'chart_of_accounts_roles_role_check' AND c.conrelid = 'accounting.chart_of_accounts_roles'::regclass;
  IF def IS NULL THEN RETURN; END IF;
  -- 202615220800 re-created the CHECK as an array literal ('{a,b,...}'::text[]); older forms quote each name ('a'::text).
  -- Read both — a quoted-name regex alone finds nothing in the literal form and the IF below silently skips.
  IF substring(def from '\{([^}]*)\}') IS NOT NULL THEN
    roles := string_to_array(substring(def from '\{([^}]*)\}'), ',');
  ELSE
    SELECT array_agg(DISTINCT m[1]) INTO roles FROM regexp_matches(def, '''([a-z0-9_]+)''', 'g') AS m;
  END IF;
  IF roles IS NULL OR cardinality(roles) < 10 THEN
    RAISE EXCEPTION '202615250600: could not read chart_of_accounts_roles_role_check (% roles) — refusing to re-create it', cardinality(roles);
  END IF;
  IF NOT ('intercompany_receivable_ih35_transportation' = ANY(roles)) THEN
    roles := array(SELECT DISTINCT unnest(roles || ARRAY['intercompany_receivable_ih35_transportation']));
    ALTER TABLE accounting.chart_of_accounts_roles DROP CONSTRAINT chart_of_accounts_roles_role_check;
    EXECUTE format('ALTER TABLE accounting.chart_of_accounts_roles ADD CONSTRAINT chart_of_accounts_roles_role_check CHECK (role = ANY (%L::text[]))', roles);
  END IF;
END $$;

-- Intercompany receivable role, USMCA only (TRANSPORTATION and TRUCKING stay frozen). Bound only where 8000 exists.
DO $$
DECLARE usmca uuid := (SELECT id FROM org.companies WHERE id = '5c854333-6ea5-4faa-af31-67cb272fef80');
        acct uuid;
BEGIN
  IF usmca IS NULL THEN RETURN; END IF;
  SELECT id INTO acct FROM catalogs.accounts
   WHERE operating_company_id = usmca AND account_number = '8000' AND deactivated_at IS NULL;
  IF acct IS NULL THEN
    RAISE NOTICE '202615250600: USMCA has no active 8000 — intercompany role not bound';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles
                  WHERE operating_company_id = usmca AND role = 'intercompany_receivable_ih35_transportation') THEN
    INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
    VALUES (usmca, 'intercompany_receivable_ih35_transportation', acct, true);
  END IF;
END $$;

COMMIT;
