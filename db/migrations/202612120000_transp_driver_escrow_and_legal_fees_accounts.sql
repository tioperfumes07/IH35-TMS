-- STAGE 3 PREREQUISITE — seed TRANSP's Driver Escrow (liability) and Legal & Professional Fees accounts.
--
-- WHY THIS EXISTS
-- The scenario build order lists `2100 Driver Escrow – Held in Trust` and `6200 Legal & Professional
-- Fees` under VERIFIED ACCOUNTS, with the instruction to confirm role/entity before posting. I confirmed
-- against prod br-fancy-credit-akjnd07a and **both exist for USMCA only**. TRANSP — the operating
-- carrier that actually employs the drivers and incurs the legal cost — has neither:
--
--   2100 Driver Escrow – Held in Trust  → USMCA only. TRANSP has Damage Claim Escrow (QBO-1150040187),
--                                          which is a DIFFERENT liability (vehicle damage claims), not
--                                          money held in trust for a driver.
--   6200 Legal & Professional Fees      → USMCA only. TRANSP's nearest is QBO-9 "Legal & Professional
--                                          Services", an Expense account of the same intent.
--
-- Without these, scenario 1 (Legal + Civil Fine) and scenario 4 (New-hire / Onboarding escrow) cannot
-- post for TRANSP: the poster would resolve no account and fail closed, which is correct behaviour but
-- means the flows simply never run.
--
-- WHY SEED RATHER THAN REUSE QBO-9
-- Legal cost could arguably post to QBO-9. Driver escrow could not — nothing on TRANSP represents
-- money held in trust for a driver, and posting it to Damage Claim Escrow would merge two unrelated
-- liabilities into one balance, which is exactly the kind of conflation that makes a trust obligation
-- unauditable. Both accounts are therefore created with the same numbers USMCA already uses, so the two
-- operating entities describe the same obligation the same way and consolidated reporting lines up.
--
-- ESCROW IS A LIABILITY, NOT INCOME — locked decision (accounting skill §4): held in trust, returned
-- 60–90 days post-separation net of deductions. Typed Liability here so it can never be booked as
-- revenue by an account-type resolver.
--
-- Additive · idempotent · entity-scoped · NO posting, NO flag, no money moves. Nothing books to these
-- accounts until the Stage-3 scenarios ship and their flags are turned on.

BEGIN;

DO $$
DECLARE
  v_transp uuid;
BEGIN
  SELECT id INTO v_transp FROM org.companies WHERE code = 'TRANSP' LIMIT 1;
  IF v_transp IS NULL THEN
    RAISE NOTICE 'STAGE3-PREREQ: TRANSP absent (fresh CI DB) — skipping account seed (0 rows).';
    RETURN;
  END IF;

  -- Scope FIRST: catalogs.accounts is FORCED-RLS, and a lookup running under a wrong-entity GUC returns
  -- NULL, which this block cannot distinguish from "absent" — it would then insert a duplicate.
  PERFORM set_config('app.operating_company_id', v_transp::text, true);

  -- Driver Escrow – Held in Trust (LIABILITY). Entity-scoped existence checks on BOTH the number and
  -- the purpose: the chart of accounts is per entity, so USMCA already holding 2100 must not block
  -- TRANSP from holding its own.
  INSERT INTO catalogs.accounts
    (account_number, account_name, account_type, account_subtype, operating_company_id, notes)
  SELECT '2100', 'Driver Escrow - Held in Trust', 'Liability', 'Other Current Liabilities', v_transp,
         'Money held in trust for a driver; returned 60-90 days post-separation net of damage/late-fee/fine deductions. LIABILITY, never income. Distinct from Damage Claim Escrow (QBO-1150040187), which covers vehicle damage claims.'
  WHERE NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_transp AND a.account_number = '2100'
  );

  -- Legal & Professional Fees (EXPENSE).
  INSERT INTO catalogs.accounts
    (account_number, account_name, account_type, account_subtype, operating_company_id, notes)
  SELECT '6200', 'Legal & Professional Fees', 'Expense', 'LegalProfessionalFees', v_transp,
         'Legal cost on a legal matter (DR 6200 / CR Cash|A/P). Mirrors USMCA 6200 so both operating entities describe the same cost the same way.'
  WHERE NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_transp AND a.account_number = '6200'
  );
END$$;

COMMIT;
