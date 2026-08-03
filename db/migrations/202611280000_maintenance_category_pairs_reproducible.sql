-- ACCT-F99b — the 9 maintenance sub-code mappings existed on PROD ONLY. No migration created them.
--
-- THE DEFECT (verified 2026-08-03). apps/backend/src/accounting/maintenance-posting/poster.service.ts:18
-- declares the codes it can emit:
--     type MaintenanceCategoryCode = "tires" | "brakes" | "engine" | "dot" | "pm_preventive"
--                                  | "body" | "electrical" | "ac" | "misc";
-- resolveAccountForCategory() matches (category_kind, category_code) EXACTLY, and an unmapped pair is
-- BILL_LINE_ACCOUNT_UNRESOLVED / CATEGORY_MAPPING_MISSING — fail-loud, no fallback. Prod carries all
-- 10 maintenance pairs for TRANSP, TRK and USMCA (expense_category_account_map 92/92 rows visible,
-- n_tup_del = 0). A union grep over EVERY file in db/migrations finds only 'maintenance'/'maintenance'.
-- The other nine were created out-of-band.
--
-- WHY THAT IS SERIOUS AND NOT COSMETIC. The table decides which GL account every maintenance expense
-- hits. If it exists only as production rows, then:
--   * fresh CI, a disaster-recovery rebuild, or a newly onboarded entity silently lacks 9 of 10 codes,
--     and every maintenance work-order posting under a specific code fails loud (the row-666 shape);
--   * the mapping cannot be reviewed, diffed, or reconstructed from version control — an auditor
--     asking "why did this repair hit this account, and who decided that" has no answer in the repo.
-- This is the same class as row 666, one layer up: the kind was seeded, the pairs were not.
--
-- WHAT THIS DOES — reproduces exactly what prod already has; it invents nothing. For every entity that
-- already carries an ACTIVE maintenance/maintenance mapping, the 9 sub-codes are seeded to THAT
-- entity's own maintenance account with THAT row's posting_side. Verified on prod: all 10 pairs point
-- at one account per entity (TRANSP QBO-1150040031, TRK TRK-QBO-1150040031, USMCA 5400), so copying
-- the anchor row reproduces the live state rather than guessing an account.
--
-- On prod this is a NO-OP (all 27 rows already exist). On a fresh database it creates what prod has.
-- Entity-agnostic: no hardcoded UUID (a fresh-from-0001 CI database seeds gen_random_uuid() companies)
-- and no hardcoded account number, so a future entity is covered the moment its anchor row exists.
-- Idempotent via NOT EXISTS on (operating_company_id, category_kind, category_code). No DELETE.

DO $$
DECLARE
  v_anchor  record;
  v_code    text;
  v_added   integer := 0;
  v_codes   text[] := ARRAY['tires','brakes','engine','dot','pm_preventive','body','electrical','ac','misc'];
BEGIN
  FOR v_anchor IN
    SELECT m.operating_company_id, m.account_id, m.posting_side
      FROM accounting.expense_category_account_map m
     WHERE m.category_kind = 'maintenance'
       AND m.category_code = 'maintenance'
       AND m.is_active = true
  LOOP
    FOREACH v_code IN ARRAY v_codes LOOP
      INSERT INTO accounting.expense_category_account_map
        (operating_company_id, category_kind, category_code, account_id, posting_side, is_active)
      SELECT v_anchor.operating_company_id, 'maintenance', v_code, v_anchor.account_id,
             v_anchor.posting_side, true
      WHERE NOT EXISTS (
        SELECT 1 FROM accounting.expense_category_account_map x
         WHERE x.operating_company_id = v_anchor.operating_company_id
           AND x.category_kind = 'maintenance'
           AND x.category_code = v_code
      );
      v_added := v_added + (CASE WHEN FOUND THEN 1 ELSE 0 END);
    END LOOP;
  END LOOP;

  RAISE NOTICE 'ACCT-F99b: seeded % missing maintenance sub-code mapping(s)', v_added;
END $$;
