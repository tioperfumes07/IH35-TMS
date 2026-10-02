-- 202615280600_faro_short_pay_resolution.sql
-- Owner ruling 2026-10-02 (00-OWNER-RULING-2026-10-02-CC2-ACCEPTED-PLUS-FOUR-RULINGS.md): "Short-pay. 'A/R variance' is
-- not an account ... Give me the two-sided entry per reason code: the debit account for each reason (billing adjustment,
-- customer claim, bad debt) against A/R on that customer, and separately the reserve movement if Faro funds the shortfall
-- (DR 2150 / CR 1235) ... Post them as two entries with a shared link, not one." Lead lifecycle: "the write-off only on
-- owner approval."
--
-- 1. 6920 Bad Debt Expense (USMCA, role bad_debt_expense, system_purpose shortpay_bad_debt) — the bad-debt reason. The
--    other reasons are USMCA's existing short-pay accounts 4910-4980, resolved by their system_purpose.
--    Written down = a reason-coded credit memo applied to the invoice (the A/R subledger) + its GL entry DR reason / CR A/R,
--    so the aging and the ledger move together.
-- 2. faro_reserve_entries short-pay resolution: the Owner either writes the shortfall down to a reason account (customer-side
--    entry DR reason / CR A/R on that customer, linked on the spine to the same Faro entry and invoice as the reserve entry)
--    or keeps it open on the customer (disputed — no entry). Kept open may later be written down; written down is final.
-- USMCA only. Configuration + columns: no entry is written here.

BEGIN;

DO $$
DECLARE def text; roles text[];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def FROM pg_constraint c
   WHERE c.conname = 'chart_of_accounts_roles_role_check' AND c.conrelid = 'accounting.chart_of_accounts_roles'::regclass;
  IF def IS NULL THEN RETURN; END IF;
  IF substring(def from '\{([^}]*)\}') IS NOT NULL THEN
    roles := string_to_array(substring(def from '\{([^}]*)\}'), ',');
  ELSE
    SELECT array_agg(DISTINCT m[1]) INTO roles FROM regexp_matches(def, '''([a-z0-9_]+)''', 'g') AS m;
  END IF;
  IF roles IS NULL OR cardinality(roles) < 10 THEN
    RAISE EXCEPTION '202615280600: could not read chart_of_accounts_roles_role_check (% roles) — refusing to re-create it', cardinality(roles);
  END IF;
  IF NOT ('bad_debt_expense' = ANY(roles)) THEN
    roles := array(SELECT DISTINCT unnest(roles || ARRAY['bad_debt_expense']));
    ALTER TABLE accounting.chart_of_accounts_roles DROP CONSTRAINT chart_of_accounts_roles_role_check;
    EXECUTE format('ALTER TABLE accounting.chart_of_accounts_roles ADD CONSTRAINT chart_of_accounts_roles_role_check CHECK (role = ANY (%L::text[]))', roles);
  END IF;
END $$;

DO $$
DECLARE v_usmca constant uuid := '5c854333-6ea5-4faa-af31-67cb272fef80'; v_6920 uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org.companies WHERE id = v_usmca) THEN RETURN; END IF;
  INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, account_subtype, system_purpose, is_postable)
  SELECT gen_random_uuid(), v_usmca, '6920', 'Bad Debt Expense', 'Expense', 'BadDebts', 'shortpay_bad_debt', true
   WHERE NOT EXISTS (SELECT 1 FROM catalogs.accounts WHERE operating_company_id = v_usmca AND account_number = '6920');
  SELECT id INTO v_6920 FROM catalogs.accounts WHERE operating_company_id = v_usmca AND account_number = '6920';
  IF NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles WHERE operating_company_id = v_usmca AND role = 'bad_debt_expense') THEN
    INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active) VALUES (v_usmca, 'bad_debt_expense', v_6920, true);
  END IF;
END $$;

ALTER TABLE accounting.faro_reserve_entries
  ADD COLUMN IF NOT EXISTS short_pay_resolution text,
  ADD COLUMN IF NOT EXISTS short_pay_reason text,
  ADD COLUMN IF NOT EXISTS short_pay_reason_account_id uuid REFERENCES catalogs.accounts(id),
  ADD COLUMN IF NOT EXISTS short_pay_credit_memo_id uuid REFERENCES accounting.credit_memos(id),
  ADD COLUMN IF NOT EXISTS short_pay_resolution_journal_entry_id uuid REFERENCES accounting.journal_entries(id),
  ADD COLUMN IF NOT EXISTS short_pay_resolved_by_user_id uuid REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS short_pay_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS short_pay_resolution_note text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faro_reserve_entries_short_pay_resolution'
                   AND conrelid = 'accounting.faro_reserve_entries'::regclass) THEN
    ALTER TABLE accounting.faro_reserve_entries ADD CONSTRAINT faro_reserve_entries_short_pay_resolution CHECK (
      (short_pay_resolution IS NULL AND short_pay_reason_account_id IS NULL AND short_pay_resolution_journal_entry_id IS NULL)
      OR (entry_kind = 'short_pay' AND short_pay_resolution = 'kept_open' AND short_pay_reason_account_id IS NULL
          AND short_pay_resolution_journal_entry_id IS NULL AND short_pay_resolved_by_user_id IS NOT NULL)
      OR (entry_kind = 'short_pay' AND short_pay_resolution = 'written_down' AND short_pay_reason IS NOT NULL
          AND short_pay_reason_account_id IS NOT NULL AND short_pay_credit_memo_id IS NOT NULL
          AND short_pay_resolution_journal_entry_id IS NOT NULL AND short_pay_resolved_by_user_id IS NOT NULL)
    );
  END IF;
END $$;

-- Kept open may be written down later; written down is final.
CREATE OR REPLACE FUNCTION accounting.faro_short_pay_resolution_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.short_pay_resolution = 'written_down'
     AND (NEW.short_pay_resolution, NEW.short_pay_reason_account_id, NEW.short_pay_resolution_journal_entry_id)
         IS DISTINCT FROM (OLD.short_pay_resolution, OLD.short_pay_reason_account_id, OLD.short_pay_resolution_journal_entry_id) THEN
    RAISE EXCEPTION 'faro_reserve_entry: short-pay % is written down — reverse its entry, never change it', OLD.id;
  END IF;
  IF OLD.short_pay_resolution = 'kept_open' AND NEW.short_pay_resolution IS DISTINCT FROM 'kept_open'
     AND NEW.short_pay_resolution IS DISTINCT FROM 'written_down' THEN
    RAISE EXCEPTION 'faro_reserve_entry: short-pay % kept open can only be written down', OLD.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_faro_short_pay_resolution_guard ON accounting.faro_reserve_entries;
CREATE TRIGGER trg_faro_short_pay_resolution_guard BEFORE UPDATE ON accounting.faro_reserve_entries
  FOR EACH ROW EXECUTE FUNCTION accounting.faro_short_pay_resolution_guard();

COMMIT;
