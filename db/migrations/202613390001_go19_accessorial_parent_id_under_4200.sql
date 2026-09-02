-- 202613390001_go19_accessorial_parent_id_under_4200.sql
-- Owner ruling (docs/lockdown/GO-19-OWNER-DECISIONS-CLOSED-2026-09-01.md §3, CLOSED):
-- "Account 4200 exists; 4210 Detention, 4220 Layover, 4230 Lumper, 4240 TONU already ratified.
--  CPA #34 / GO-12 L164-167: children of Line Haul. Defect: four children have NO parent -- sit
--  flat beside 4200, P&L five lines, no roll-up. Chart already does this correctly at
--  4900 -> 4910-4980. Fix: ONE migration: four parent_id references under 4200. NO new account."
--
-- Live-verified gap (2026-09-02, catalogs.accounts): 4210/4220/4230/4240 all have
-- parent_account_id IS NULL for USMCA. 4200 itself exists (id cc3798c2-5fb2-49c9-a81e-fb8be7b2349b),
-- also parent_account_id IS NULL (correct -- 4200 is itself a top-level Income account, mirroring
-- 4900 which is also parent_account_id IS NULL while 4910-4980 correctly point to it).
--
-- Additive-only in effect (an UPDATE, not a DROP/CREATE), idempotent (re-running is a no-op once
-- parent_account_id is set), scoped by operating_company_id + exact account_number (never a name
-- match, matching this migration's own sibling 202611150000's convention). No new account created.

DO $$
DECLARE
  v_opco uuid;
  v_parent_4200 uuid;
BEGIN
  SELECT id INTO v_opco FROM org.companies WHERE code = 'USMCA';
  IF v_opco IS NULL THEN
    RAISE NOTICE 'go19_accessorial_parent_id_under_4200: USMCA company not found -- skip';
    RETURN;
  END IF;

  SELECT id INTO v_parent_4200
  FROM catalogs.accounts
  WHERE operating_company_id = v_opco
    AND account_number = '4200'
    AND deactivated_at IS NULL;

  IF v_parent_4200 IS NULL THEN
    RAISE NOTICE 'go19_accessorial_parent_id_under_4200: 4200 not found for USMCA -- skip (no new account minted)';
    RETURN;
  END IF;

  UPDATE catalogs.accounts
  SET parent_account_id = v_parent_4200,
      updated_at = now()
  WHERE operating_company_id = v_opco
    AND account_number IN ('4210', '4220', '4230', '4240')
    AND deactivated_at IS NULL
    AND parent_account_id IS DISTINCT FROM v_parent_4200;
END $$;
