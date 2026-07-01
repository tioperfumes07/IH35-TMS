-- [HOLD-FOR-JORGE — TIER 1] B2 (backfill) — link connected bank accounts to a Bank-type COA account
-- Writes banking.bank_accounts.ledger_account_id + may create catalogs.accounts rows (financial cluster) →
-- PROTECTED, gated. NEVER self-merge. Runs on a Neon branch under GUARD/Jorge before prod.
--
-- WHY: QuickBooks parity — a connected bank must BE a Bank-type account in the chart of accounts (that COA
-- account is the register). Today banking.bank_accounts has a ledger_account_id FK but it's unset, so the
-- bank is invisible in the COA and there's no register. This idempotently links each active bank account to
-- a Bank-type COA account for its entity: it REUSES an existing unlinked bank account (preferring the seeded
-- system_purpose='bank_operating' one — for USMCA that's account 1000 from B1), and only CREATES one (in the
-- 1000-1099 range) when none is free. NO opening JE — balances stay owner-entered.
--
-- Does NOT touch the live connect flow (that auto-link is a separate follow-up). Idempotent: rows already
-- linked are skipped; re-run creates nothing new. af1-safe: sets app.operating_company_id per entity so the
-- catalogs.accounts WITH CHECK accepts any created row.

BEGIN;

DO $$
DECLARE
  r record;
  v_coa uuid;
  v_num text;
BEGIN
  FOR r IN
    SELECT b.id, b.operating_company_id, b.account_name, b.account_mask
    FROM banking.bank_accounts b
    WHERE b.ledger_account_id IS NULL
      AND b.deactivated_at IS NULL
      AND b.is_active = true
  LOOP
    PERFORM set_config('app.operating_company_id', r.operating_company_id::text, true);

    -- 1) reuse an existing Bank-type COA account for this entity that isn't linked to another bank account
    SELECT a.id INTO v_coa
    FROM catalogs.accounts a
    WHERE a.operating_company_id = r.operating_company_id
      AND a.account_type = 'Asset'
      AND a.account_subtype IN ('Checking', 'Savings', 'Money Market', 'Cash on hand')
      AND a.deactivated_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM banking.bank_accounts b2 WHERE b2.ledger_account_id = a.id)
    ORDER BY (a.system_purpose = 'bank_operating') DESC NULLS LAST, a.account_number
    LIMIT 1;

    -- 2) else create one at the LOWEST free number in the reserved 1000-1099 bank block
    IF v_coa IS NULL THEN
      SELECT cand.n INTO v_num
      FROM (SELECT '1' || lpad(g::text, 3, '0') AS n FROM generate_series(0, 99) AS g) cand
      WHERE NOT EXISTS (
        SELECT 1 FROM catalogs.accounts a
        WHERE a.operating_company_id = r.operating_company_id AND a.account_number = cand.n
      )
      ORDER BY cand.n
      LIMIT 1;

      INSERT INTO catalogs.accounts
        (account_number, account_name, account_type, account_subtype, operating_company_id, system_purpose)
      VALUES (
        v_num,
        COALESCE(r.account_name, 'Bank Account') || COALESCE(' ' || r.account_mask, ''),
        'Asset', 'Checking', r.operating_company_id, 'bank_connected'
      )
      ON CONFLICT (operating_company_id, account_number) DO NOTHING
      RETURNING id INTO v_coa;

      -- if the number collided (concurrent/edge), fall back to re-selecting the just-inserted or existing row
      IF v_coa IS NULL THEN
        SELECT id INTO v_coa FROM catalogs.accounts
        WHERE operating_company_id = r.operating_company_id AND account_number = v_num LIMIT 1;
      END IF;
    END IF;

    IF v_coa IS NOT NULL THEN
      UPDATE banking.bank_accounts SET ledger_account_id = v_coa, updated_at = now() WHERE id = r.id;
    END IF;
  END LOOP;
END$$;

COMMIT;
