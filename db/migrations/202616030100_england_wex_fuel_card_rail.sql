-- 202616030100_england_wex_fuel_card_rail.sql  (Lead, claimed on main first)
-- OWNER 2026-10-21 10:30 CT: "we need to create a new account for england, also in banking etc, its a fule card. england wex
-- gets paid from our bank account." England Logistics WEX is billed in arrears and paid from the operating bank.
-- The Settlement Creator previously knew only Dreamline / Relay.
--
-- 1. Role fuel_card_payable_wex admitted to chart_of_accounts_roles_role_check (dynamic append, as 202615370930).
-- 2. USMCA account 2520 England Logistics WEX Fuel Card Payable (Liability / CreditCard, under 2500 Credit Cards).
-- 3. Role fuel_card_payable_wex -> 2520 (never overwrites an active owner designation).
-- 4. Vendor England Logistics (the card issuer the bank pays) + catalogs.fuel_card_types WEX (issuer = that vendor).
-- 5. banking.bank_accounts "England WEX Fuel Card" (credit) on ledger 2520 — the card's register in Banking; the bank
--    payment to England matches as a transfer Dr 2520 / Cr bank.
-- 6. OWNER load history 10-21-26 ("the load data i provided is the most current"): AlwaysTrack numbered the two loads the
--    app booked while Pending on 10-16 as 13684 (Armstrong WO 4741002-1) and 13685 (DGL WO L-44212); AlwaysTrack 13682 /
--    13683 are other loads (AB Global 0062118 on settlement 5844, Griffith 164358 on 5847). Same row and id — only the
--    number moves (stops, geofence, DVIR, assignment history stay on the trip); trg_audit_loads records old/new.
--
-- IDEMPOTENT + FRESH-DB SAFE: every step checks first; no USMCA / no 2500 / no such load -> NOTICE + skip.

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
    RAISE EXCEPTION '202616030100: could not read chart_of_accounts_roles_role_check (% roles) — refusing to re-create it', cardinality(roles);
  END IF;
  IF NOT (roles @> ARRAY['fuel_card_payable_wex']) THEN
    roles := array(SELECT DISTINCT unnest(roles || ARRAY['fuel_card_payable_wex']));
    ALTER TABLE accounting.chart_of_accounts_roles DROP CONSTRAINT chart_of_accounts_roles_role_check;
    EXECUTE format('ALTER TABLE accounting.chart_of_accounts_roles ADD CONSTRAINT chart_of_accounts_roles_role_check CHECK (role = ANY (%L::text[]))', roles);
  END IF;
END $$;

DO $$
DECLARE
  v_usmca uuid;
  v_parent uuid;
  v_acct uuid;
  v_vendor uuid;
  r record;
BEGIN
  SELECT id INTO v_usmca FROM org.companies WHERE code = 'USMCA' AND deactivated_at IS NULL LIMIT 1;
  IF v_usmca IS NULL THEN
    RAISE NOTICE '202616030100: USMCA company row not found -- skipping';
    RETURN;
  END IF;
  PERFORM set_config('app.operating_company_id', v_usmca::text, true);
  PERFORM set_config('app.bypass_rls', 'lucia', true);

  SELECT id INTO v_parent FROM catalogs.accounts
   WHERE operating_company_id = v_usmca AND account_number = '2500' AND deactivated_at IS NULL;
  IF v_parent IS NULL THEN
    RAISE NOTICE '202616030100: parent 2500 absent -- skipping rail setup';
    RETURN;
  END IF;

  -- 2. the card payable account
  SELECT id INTO v_acct FROM catalogs.accounts
   WHERE operating_company_id = v_usmca AND account_number = '2520' AND deactivated_at IS NULL LIMIT 1;
  IF v_acct IS NULL THEN
    INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, account_subtype,
                                   parent_account_id, is_postable, currency_code, notes, posts_to_financials)
    VALUES (v_usmca, '2520', 'England Logistics WEX Fuel Card Payable', 'Liability', 'CreditCard', v_parent, true, 'USD',
            'England Logistics WEX fuel card (owner 2026-10-21). Card fills credit it at what WEX charges; the bank payment to England debits it.',
            true)
    RETURNING id INTO v_acct;
  ELSIF NOT EXISTS (SELECT 1 FROM catalogs.accounts WHERE id = v_acct AND account_type = 'Liability'
                    AND account_subtype = 'CreditCard' AND parent_account_id = v_parent AND is_postable) THEN
    RAISE EXCEPTION '202616030100: USMCA account 2520 exists but is not a postable Liability — refusing to bind the WEX rail to it';
  END IF;

  -- 3. role binding
  IF EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles WHERE operating_company_id = v_usmca
              AND role = 'fuel_card_payable_wex' AND is_active AND account_id IS DISTINCT FROM v_acct) THEN
    RAISE EXCEPTION '202616030100: active WEX role is bound elsewhere -- refusing to overwrite';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles
                  WHERE operating_company_id = v_usmca AND role = 'fuel_card_payable_wex' AND is_active) THEN
    INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active, created_at, updated_at)
    VALUES (v_usmca, 'fuel_card_payable_wex', v_acct, true, now(), now());
  END IF;

  -- 4. issuer vendor + card type
  SELECT id INTO v_vendor FROM mdata.vendors
   WHERE operating_company_id = v_usmca AND lower(btrim(vendor_name)) = 'england logistics' LIMIT 1;
  IF v_vendor IS NULL THEN
    INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type, vendor_category, source_system, is_sample_data)
    VALUES (v_usmca, 'England Logistics', 'Other', 'diesel', 'tms', false)
    RETURNING id INTO v_vendor;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM catalogs.fuel_card_types WHERE operating_company_id = v_usmca AND code = 'WEX') THEN
    INSERT INTO catalogs.fuel_card_types (operating_company_id, code, display_name, is_active, sort_order, issuer_vendor_id)
    VALUES (v_usmca, 'WEX', 'England Logistics WEX Fuel Card', true, 50, v_vendor);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM catalogs.fuel_card_types WHERE operating_company_id = v_usmca
                   AND code = 'WEX' AND is_active AND issuer_vendor_id = v_vendor) THEN
    RAISE EXCEPTION '202616030100: existing WEX card is inactive or has a different issuer';
  END IF;

  -- 5. Banking register for the card
  IF NOT EXISTS (SELECT 1 FROM banking.bank_accounts WHERE operating_company_id = v_usmca AND ledger_account_id = v_acct) THEN
    INSERT INTO banking.bank_accounts (operating_company_id, institution_name, account_name, account_type, currency_code,
                                       current_balance_cents, available_balance_cents, is_active, sync_status, ledger_account_id,
                                       account_class, display_order, display_name, visible)
    VALUES (v_usmca, 'England Logistics (WEX)', 'England WEX Fuel Card', 'credit_card', 'USD', 0, 0, true, 'active', v_acct,
            'credit', 3, 'England WEX Fuel Card', true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM banking.bank_accounts WHERE operating_company_id = v_usmca
                   AND ledger_account_id = v_acct AND is_active AND visible AND account_class = 'credit') THEN
    RAISE EXCEPTION '202616030100: existing WEX register is inactive, hidden or not a credit account';
  END IF;

  -- 6. the two loads AlwaysTrack numbered after the app booked them (guarded by id + W.O.; never onto a taken number)
  FOR r IN SELECT * FROM (VALUES
      ('40b7358b-630d-425a-af20-543ccdf45379'::uuid, '13683', '13684', '4741002-1'),
      ('0ee2ea55-e7f1-4c1a-86dd-ef2033b6b715'::uuid, '13682', '13685', 'L-44212')) AS t(id, old_no, new_no, wo)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM mdata.loads WHERE id = r.id AND operating_company_id = v_usmca
                     AND load_number = r.old_no AND customer_wo_number = r.wo) THEN
      RAISE NOTICE '202616030100: load % (% WO %) not as expected -- skipped', r.id, r.old_no, r.wo;
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM mdata.loads WHERE operating_company_id = v_usmca AND load_number = r.new_no) THEN
      RAISE EXCEPTION '202616030100: load number % already exists — refusing to renumber %', r.new_no, r.old_no;
    END IF;
    UPDATE mdata.loads
       SET load_number = r.new_no,
           notes = concat_ws(E'\n', notes, format('2026-10-21: renumbered %s -> %s to match AlwaysTrack (owner load history 10-21-26; booked while Pending on 10-16)', r.old_no, r.new_no))
     WHERE id = r.id AND operating_company_id = v_usmca
       AND load_number = r.old_no AND customer_wo_number = r.wo;
  END LOOP;
END $$;

COMMIT;
