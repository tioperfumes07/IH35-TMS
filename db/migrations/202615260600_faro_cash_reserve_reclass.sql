-- 202615260600_faro_cash_reserve_reclass.sql
-- Lead 2026-10-02 (00-LEAD-RETRACTION-2026-10-02-TWO-RESERVE-POOLS-ARE-REAL-KEEP-1235.md): "A NEGATIVE RESERVE IS A
-- LIABILITY, NOT A NEGATIVE ASSET. Cash Reserve is -0.51 today and has been far more negative. At period end a credit
-- balance in 1235 reclassifies to a payable to Faro." And (FARO-REPORTS-ARE-THE-BANK-FEED): "a negative cash reserve
-- presents as a payable to Faro, never a negative asset."
--
-- 1. 2156 Due to Faro — Cash Reserve Deficit (Liability, USMCA), role factor_cash_reserve_deficit_payable.
-- 2. accounting.faro_cash_reserve_reclasses — one live row per company and period end: the deficit at period end, the reclass
--    entry dated the period end (DR 1235 / CR 2156) and its reversal dated the next day (DR 2156 / CR 1235), so the
--    balance sheet presents the deficit as a liability and the next period starts from Faro's own running balance.
-- USMCA only (TRANSPORTATION and TRUCKING stay frozen). Configuration + an empty table: no entry is written here.

BEGIN;

DO $$
DECLARE def text; roles text[];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def FROM pg_constraint c
   WHERE c.conname = 'chart_of_accounts_roles_role_check' AND c.conrelid = 'accounting.chart_of_accounts_roles'::regclass;
  IF def IS NULL THEN RETURN; END IF;
  -- The CHECK is an array literal ('{a,b,...}'::text[]) since 202615220800; older forms quote each name.
  IF substring(def from '\{([^}]*)\}') IS NOT NULL THEN
    roles := string_to_array(substring(def from '\{([^}]*)\}'), ',');
  ELSE
    SELECT array_agg(DISTINCT m[1]) INTO roles FROM regexp_matches(def, '''([a-z0-9_]+)''', 'g') AS m;
  END IF;
  IF roles IS NULL OR cardinality(roles) < 10 THEN
    RAISE EXCEPTION '202615260600: could not read chart_of_accounts_roles_role_check (% roles) — refusing to re-create it', cardinality(roles);
  END IF;
  IF NOT ('factor_cash_reserve_deficit_payable' = ANY(roles)) THEN
    roles := array(SELECT DISTINCT unnest(roles || ARRAY['factor_cash_reserve_deficit_payable']));
    ALTER TABLE accounting.chart_of_accounts_roles DROP CONSTRAINT chart_of_accounts_roles_role_check;
    EXECUTE format('ALTER TABLE accounting.chart_of_accounts_roles ADD CONSTRAINT chart_of_accounts_roles_role_check CHECK (role = ANY (%L::text[]))', roles);
  END IF;
END $$;

DO $$
DECLARE
  v_usmca constant uuid := '5c854333-6ea5-4faa-af31-67cb272fef80';
  v_2156 uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org.companies WHERE id = v_usmca) THEN RETURN; END IF;
  INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, account_subtype, is_postable)
  SELECT gen_random_uuid(), v_usmca, '2156', 'Due to Faro — Cash Reserve Deficit', 'Liability', 'OtherCurrentLiability', true
   WHERE NOT EXISTS (SELECT 1 FROM catalogs.accounts WHERE operating_company_id = v_usmca AND account_number = '2156');
  SELECT id INTO v_2156 FROM catalogs.accounts WHERE operating_company_id = v_usmca AND account_number = '2156';
  IF NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles WHERE operating_company_id = v_usmca AND role = 'factor_cash_reserve_deficit_payable') THEN
    INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
    VALUES (v_usmca, 'factor_cash_reserve_deficit_payable', v_2156, true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS accounting.faro_cash_reserve_reclasses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  period_end date NOT NULL,
  deficit_cents bigint NOT NULL CHECK (deficit_cents > 0),
  journal_entry_id uuid REFERENCES accounting.journal_entries(id),
  reversal_journal_entry_id uuid REFERENCES accounting.journal_entries(id),
  posted_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  posted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- One LIVE reclass per company and period is enforced by the service (its entries not voided, under an advisory lock):
-- a reclass whose two entries were voided through the void engine may be posted again — history is never edited.
CREATE INDEX IF NOT EXISTS faro_cash_reserve_reclasses_period_idx ON accounting.faro_cash_reserve_reclasses (operating_company_id, period_end);

-- Written once: the two entries are stamped right after insert (same transaction) and never change after.
CREATE OR REPLACE FUNCTION accounting.faro_cash_reserve_reclass_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.journal_entry_id IS NOT NULL AND NEW.journal_entry_id IS DISTINCT FROM OLD.journal_entry_id)
     OR (OLD.reversal_journal_entry_id IS NOT NULL AND NEW.reversal_journal_entry_id IS DISTINCT FROM OLD.reversal_journal_entry_id)
     OR (NEW.operating_company_id, NEW.period_end, NEW.deficit_cents, NEW.posted_by_user_id)
        IS DISTINCT FROM (OLD.operating_company_id, OLD.period_end, OLD.deficit_cents, OLD.posted_by_user_id) THEN
    RAISE EXCEPTION 'faro_cash_reserve_reclass: % is written once — reverse its entries, never edit it', OLD.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_faro_cash_reserve_reclass_guard ON accounting.faro_cash_reserve_reclasses;
CREATE TRIGGER trg_faro_cash_reserve_reclass_guard BEFORE UPDATE ON accounting.faro_cash_reserve_reclasses
  FOR EACH ROW EXECUTE FUNCTION accounting.faro_cash_reserve_reclass_guard();

DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON accounting.faro_cash_reserve_reclasses;
CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.faro_cash_reserve_reclasses
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();
DROP TRIGGER IF EXISTS tg_audit_row_faro_cash_reserve_reclasses ON accounting.faro_cash_reserve_reclasses;
CREATE TRIGGER tg_audit_row_faro_cash_reserve_reclasses AFTER INSERT OR UPDATE OR DELETE ON accounting.faro_cash_reserve_reclasses
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

ALTER TABLE accounting.faro_cash_reserve_reclasses ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.faro_cash_reserve_reclasses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS faro_cash_reserve_reclasses_company_isolation ON accounting.faro_cash_reserve_reclasses;
CREATE POLICY faro_cash_reserve_reclasses_company_isolation ON accounting.faro_cash_reserve_reclasses
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON accounting.faro_cash_reserve_reclasses TO ih35_app;

COMMIT;
