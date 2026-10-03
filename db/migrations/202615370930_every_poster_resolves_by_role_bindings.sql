-- 202615370930_every_poster_resolves_by_role_bindings.sql  (CLAIM-RESERVE #24799, CC-3)
-- ROUND 365.1 — a poster resolves the account it posts to by ROLE, never by account number or account name. Five posting
-- paths still looked an account up by its number (1260, 2510, 2200, 2250, 1100, 4200) or by a name ILIKE / "latest
-- updated" guess. Each number is a fact about ONE company's chart; a role is the contract the owner designates on the
-- CoA Roles page, and resolveRoleAccount fails CLOSED (names the role) where it is not bound.
--
-- This migration is CONFIG ONLY — it binds, for USMCA, the role to the SAME account the poster already used by number,
-- so no posting moves account:
--   interest_receivable                -> 1260 Interest Receivable              (related-party loan interest accrual, out)
--   fuel_card_payable_dreamline        -> 2510 Dreamline Diesel Card Payable    (fuel poster / settlement creator card rail)
--   driver_settlements_payable         -> 2200 Driver Settlements Payable       (broker advance -> driver bill disbursement)
--   accessorial_revenue                -> 4200 Accessorial / Detention Income   (settlement creator accessorial projection)
--   broker_customer_advance_liability  -> 2250 Customer Deposits (Broker Advances)  (role admitted since ND-INV-01, never bound)
-- 1100 already resolves through ar_control. Each role is new (CHECK widened by the dynamic append shape 202615330600 uses)
-- except broker_customer_advance_liability.
--
-- IDEMPOTENT: the CHECK append is a no-op once present; each binding inserts only where no ACTIVE binding exists for that
-- (company, role) — an owner designation is never overwritten. FRESH-DB SAFE: no USMCA / no account -> NOTICE + skip.

BEGIN;

SET LOCAL search_path TO pg_catalog, public;

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
    RAISE EXCEPTION '202615370930: could not read chart_of_accounts_roles_role_check (% roles) — refusing to re-create it', cardinality(roles);
  END IF;
  IF NOT (roles @> ARRAY['interest_receivable','fuel_card_payable_dreamline','driver_settlements_payable','accessorial_revenue']) THEN
    roles := array(SELECT DISTINCT unnest(roles || ARRAY['interest_receivable','fuel_card_payable_dreamline','driver_settlements_payable','accessorial_revenue']));
    ALTER TABLE accounting.chart_of_accounts_roles DROP CONSTRAINT chart_of_accounts_roles_role_check;
    EXECUTE format('ALTER TABLE accounting.chart_of_accounts_roles ADD CONSTRAINT chart_of_accounts_roles_role_check CHECK (role = ANY (%L::text[]))', roles);
  END IF;
END $$;

DO $$
DECLARE
  v_usmca uuid;
  v_acct uuid;
  b record;
BEGIN
  IF to_regclass('accounting.chart_of_accounts_roles') IS NULL THEN RETURN; END IF;
  SELECT id INTO v_usmca FROM org.companies WHERE code = 'USMCA' AND deactivated_at IS NULL LIMIT 1;
  IF v_usmca IS NULL THEN
    RAISE NOTICE '202615370930: USMCA company row not found -- skipping role bindings';
    RETURN;
  END IF;
  FOR b IN SELECT * FROM (VALUES
      ('interest_receivable', '1260'),
      ('fuel_card_payable_dreamline', '2510'),
      ('driver_settlements_payable', '2200'),
      ('accessorial_revenue', '4200'),
      ('broker_customer_advance_liability', '2250')) AS t(role, account_number)
  LOOP
    IF EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles r
                WHERE r.operating_company_id = v_usmca AND r.role = b.role AND r.is_active) THEN
      CONTINUE;
    END IF;
    SELECT id INTO v_acct FROM catalogs.accounts
     WHERE operating_company_id = v_usmca AND account_number = b.account_number
       AND deactivated_at IS NULL AND is_postable = true
     LIMIT 1;
    IF v_acct IS NULL THEN
      RAISE NOTICE '202615370930: USMCA account % not found or not postable -- % stays unbound (its poster fails closed)', b.account_number, b.role;
      CONTINUE;
    END IF;
    INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active, created_at, updated_at)
    VALUES (v_usmca, b.role, v_acct, true, now(), now());
  END LOOP;
END $$;

COMMIT;
