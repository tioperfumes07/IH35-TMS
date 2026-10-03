-- 202615330600_one_leg_asset_accounts_never_credit.sql
-- ROUND 352 F-2 + F-3 (one family: an entry posting one leg). Two ASSET accounts that hold money carry credit balances:
--   1090 Undeposited Funds   -$151,736.34   two manual "TB close" sweeps (ACCT-F20260925i/j, DR 1000 / CR 1090,
--                                          $166,868.94) moved a balance whose receipts were later reversed at source;
--                                          the sweeps were never reversed.
--   1295 Relay Fuel Wallet   -$33,839.80   every fuel spend credits the wallet; the wallet's funding (the Relay top-up,
--                                          a card PURCHASE on the operating account) sits in For Review and has never
--                                          posted, so not one funding debit exists. 1295 also had NO declared role.
-- An asset that holds money cannot be negative: the money left before it arrived. Refused in the DATABASE (so an import,
-- a manual journal or a direct call cannot route around it), at commit (deferred), per posting:
--   a CREDIT to an account bound to role undeposited_funds or fuel_wallet_relay that leaves it with a credit balance is
--   refused — naming the account, the balance and the missing leg. Debits always pass (they are the missing leg).
--   Reversing entries pass (reverses_je_id set): the governed purge reverses GL before it voids, and a reversal only
--   ever unwinds an earlier posting.
-- Both accounts are negative today, so until they are funded / their sweeps reversed, new non-reversal credits to them
-- are refused — which is the point: the next spend must follow its funding.

BEGIN;

SET LOCAL search_path TO pg_catalog, public;

-- 1. Role fuel_wallet_relay in the CHECK (array-literal or IN-list form, both read; refuse to proceed on a short read).
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
    RAISE EXCEPTION '202615330600: could not read chart_of_accounts_roles_role_check (% roles) — refusing to re-create it', cardinality(roles);
  END IF;
  IF NOT ('fuel_wallet_relay' = ANY(roles)) THEN
    roles := array(SELECT DISTINCT unnest(roles || ARRAY['fuel_wallet_relay']));
    ALTER TABLE accounting.chart_of_accounts_roles DROP CONSTRAINT chart_of_accounts_roles_role_check;
    EXECUTE format('ALTER TABLE accounting.chart_of_accounts_roles ADD CONSTRAINT chart_of_accounts_roles_role_check CHECK (role = ANY (%L::text[]))', roles);
  END IF;
END $$;

-- 2. Declare it: bind fuel_wallet_relay to each company's Relay wallet account (system_purpose relay_fuel_wallet — 1295 in
--    USMCA and TRANSP). One active binding per company (uq_coa_roles_company_role_active).
INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
SELECT a.operating_company_id, 'fuel_wallet_relay', a.id, true
  FROM catalogs.accounts a
 WHERE a.system_purpose = 'relay_fuel_wallet' AND a.deactivated_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles r
                    WHERE r.operating_company_id = a.operating_company_id AND r.role = 'fuel_wallet_relay' AND r.is_active);

-- 3. The refusal.
CREATE OR REPLACE FUNCTION accounting.refuse_one_leg_asset_credit() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_role text;
  v_skip boolean;
  v_balance bigint;
  v_label text;
BEGIN
  IF NEW.debit_or_credit IS DISTINCT FROM 'credit' THEN RETURN NULL; END IF;
  SELECT r.role INTO v_role
    FROM accounting.chart_of_accounts_roles r
   WHERE r.account_id = NEW.account_id AND r.is_active AND r.role IN ('undeposited_funds', 'fuel_wallet_relay')
   ORDER BY r.role DESC
   LIMIT 1;
  IF v_role IS NULL THEN RETURN NULL; END IF;
  SELECT (je.reverses_je_id IS NOT NULL OR je.status IS DISTINCT FROM 'posted') INTO v_skip
    FROM accounting.journal_entries je WHERE je.id = NEW.journal_entry_uuid;
  IF v_skip IS NOT FALSE THEN RETURN NULL; END IF;
  SELECT COALESCE(sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::bigint
    INTO v_balance
    FROM accounting.journal_entry_postings p
    JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.status = 'posted'
   WHERE p.account_id = NEW.account_id;
  IF v_balance < 0 THEN
    SELECT a.account_number || ' ' || a.account_name INTO v_label FROM catalogs.accounts a WHERE a.id = NEW.account_id;
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = format('posting refused: %s would hold a credit balance of %s — an asset that holds money cannot be negative.',
                       v_label, to_char(v_balance / 100.0, 'FM999,999,990.00')),
      HINT = CASE v_role
               WHEN 'fuel_wallet_relay' THEN 'Record the Relay top-up (the card purchase on the operating account) as a transfer into the wallet first; the spend follows its funding.'
               ELSE 'Record the receipt into Undeposited Funds before it is deposited or swept to the bank.'
             END;
  END IF;
  RETURN NULL;
END
$fn$;

DROP TRIGGER IF EXISTS trg_refuse_one_leg_asset_credit ON accounting.journal_entry_postings;
CREATE CONSTRAINT TRIGGER trg_refuse_one_leg_asset_credit
  AFTER INSERT OR UPDATE OF amount_cents, debit_or_credit, account_id ON accounting.journal_entry_postings
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_one_leg_asset_credit();

-- Post-conditions.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_refuse_one_leg_asset_credit' AND NOT tgisinternal AND tgenabled <> 'D') THEN
    RAISE EXCEPTION '202615330600: trg_refuse_one_leg_asset_credit missing';
  END IF;
  IF EXISTS (SELECT 1 FROM catalogs.accounts a
              WHERE a.system_purpose = 'relay_fuel_wallet' AND a.deactivated_at IS NULL
                AND NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles r
                                 WHERE r.account_id = a.id AND r.role = 'fuel_wallet_relay' AND r.is_active)) THEN
    RAISE EXCEPTION '202615330600: a Relay wallet account has no active fuel_wallet_relay binding';
  END IF;
END $$;

COMMIT;
