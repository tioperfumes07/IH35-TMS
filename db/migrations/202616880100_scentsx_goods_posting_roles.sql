-- SCENTSX B3b — goods posting roles for ScentsX LLC + the stock-move posting flag.
--
-- Owner 2026-11-26 20:16 CT "a full accounting engines making sure linkage connectivity … complete wiring to ledgers
-- liabilities assets"; 20:28 CT (via the P1 seat) FIFO lots for the books. Design https://claude.ai/artifact/VQ83ogvJyPpVoop1FNKJXC
-- (Ledger wiring — posting map). The P1 seat's perfume.stock_moves (202616850100) is the source of every inventory move;
-- apps/backend/src/scentsx/stock-move-poster.service.ts posts each move through the EXISTING journal-entry writer
-- (createJournalEntryOnClient — balance, open-period and audit rules unchanged) and resolves every account by role here.
--
-- 1. accounting.chart_of_accounts_roles_role_check is widened by READING the live constraint and appending the new values,
--    (the 202616030100 reader: both the '{a,b}'::text[] and the quoted-list shapes), so no role another seat added can be
--    dropped by a hand-copied list; it refuses to rebuild if it reads fewer than 10 roles.
-- 2. SCENTSX role bindings (accounts seeded by 202616830100): inventory_asset 1200, inventory_in_transit 1290,
--    goods_received_not_billed 2050, cogs_goods 5000, inventory_shrink 5200, inventory_writedown 5210,
--    opening_balance_equity 3800, cash_clearing 1090.
-- 3. Flag SCENTSX_STOCK_MOVE_GL_POSTING_ENABLED: default OFF everywhere; ON for SCENTSX only (owner 20:16 CT; 21:24 CT to the P1
--    seat: "just create the engines and complete. Fully linked and wired."). The existing writer refuses a date inside a closed
--    period (ensureOpenPeriod); ScentsX has no closed period, so moves post by their own date.

BEGIN;

DO $$
DECLARE def text; roles text[];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def FROM pg_constraint c
   WHERE c.conname = 'chart_of_accounts_roles_role_check' AND c.conrelid = 'accounting.chart_of_accounts_roles'::regclass;
  IF def IS NULL THEN
    RAISE EXCEPTION '202616880100: chart_of_accounts_roles_role_check not found — refusing to re-create it blind';
  END IF;
  -- Same reader as 202616030100: the live CHECK is either role = ANY ('{a,b,…}'::text[]) or a quoted list.
  IF substring(def from '\{([^}]*)\}') IS NOT NULL THEN
    roles := string_to_array(substring(def from '\{([^}]*)\}'), ',');
  ELSE
    SELECT array_agg(DISTINCT m[1]) INTO roles FROM regexp_matches(def, '''([a-z0-9_]+)''', 'g') AS m;
  END IF;
  IF roles IS NULL OR cardinality(roles) < 10 THEN
    RAISE EXCEPTION '202616880100: could not read chart_of_accounts_roles_role_check (% roles) — refusing to re-create it', cardinality(roles);
  END IF;
  IF NOT (roles @> ARRAY['inventory_asset', 'inventory_in_transit', 'goods_received_not_billed', 'cogs_goods',
                         'inventory_shrink', 'inventory_writedown', 'opening_balance_equity']) THEN
    roles := array(SELECT DISTINCT unnest(roles || ARRAY['inventory_asset', 'inventory_in_transit', 'goods_received_not_billed', 'cogs_goods', 'inventory_shrink', 'inventory_writedown', 'opening_balance_equity']));
    ALTER TABLE accounting.chart_of_accounts_roles DROP CONSTRAINT chart_of_accounts_roles_role_check;
    EXECUTE format('ALTER TABLE accounting.chart_of_accounts_roles ADD CONSTRAINT chart_of_accounts_roles_role_check CHECK (role = ANY (%L::text[]))', roles);
  END IF;
END $$;

DO $$
DECLARE
  v_co uuid;
  v_acct uuid;
  r RECORD;
BEGIN
  SELECT id INTO v_co FROM org.companies WHERE code = 'SCENTSX';
  IF v_co IS NULL THEN
    RAISE EXCEPTION 'SCENTSX company not found (202616820200 must run first)';
  END IF;
  PERFORM set_config('app.operating_company_id', v_co::text, true);
  FOR r IN
    SELECT * FROM (VALUES
      ('inventory_asset', '1200'), ('inventory_in_transit', '1290'), ('goods_received_not_billed', '2050'),
      ('cogs_goods', '5000'), ('inventory_shrink', '5200'), ('inventory_writedown', '5210'),
      ('opening_balance_equity', '3800'), ('cash_clearing', '1090')
    ) AS t(role, num)
  LOOP
    SELECT a.id INTO v_acct FROM catalogs.accounts a
     WHERE a.operating_company_id = v_co AND a.account_number = r.num AND a.deactivated_at IS NULL AND a.is_postable = true LIMIT 1;
    IF v_acct IS NULL THEN
      RAISE EXCEPTION 'SCENTSX account % missing for role % — refusing to bind blind', r.num, r.role;
    END IF;
    INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
    SELECT v_co, r.role, v_acct, true
    WHERE NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles x
                       WHERE x.operating_company_id = v_co AND x.role = r.role AND x.is_active = true);
  END LOOP;
END $$;

INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES ('SCENTSX_STOCK_MOVE_GL_POSTING_ENABLED',
        'SCENTSX B3b: post each TIO Perfumes stock move (perfume.stock_moves) to ScentsX''s general ledger through the existing journal-entry writer. Per entity, ON only for SCENTSX.',
        false, 0)
ON CONFLICT (flag_key) DO NOTHING;

DO $$
DECLARE
  v_co uuid := (SELECT id FROM org.companies WHERE code = 'SCENTSX');
  v_setter uuid;
BEGIN
  PERFORM set_config('app.bypass_rls', 'lucia', true);
  SELECT u.id INTO v_setter FROM identity.users u
   WHERE u.role = 'Owner' AND u.deactivated_at IS NULL AND u.archived_at IS NULL ORDER BY u.created_at LIMIT 1;
  IF v_co IS NULL OR v_setter IS NULL THEN
    RAISE NOTICE 'SCENTSX or an Owner user is missing — flag stays OFF';
    RETURN;
  END IF;
  INSERT INTO lib.feature_flag_overrides (uuid, flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, set_at, expires_at)
  VALUES (gen_random_uuid(), 'SCENTSX_STOCK_MOVE_GL_POSTING_ENABLED', v_co, NULL, true, v_setter, now(), NULL)
  ON CONFLICT (flag_key, operating_company_id) WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL DO NOTHING;
END $$;

COMMIT;
