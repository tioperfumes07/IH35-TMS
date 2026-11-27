-- PERFUME desk speed (owner 2026-11-26 23:23 CT: "IN ITEMS COULDNT LOAD THE ITEM FILE").
--
-- Every perfume table is walled by the same owner-only rule, USING (perfume.is_owner()). Written that way Postgres runs the
-- function once for EVERY row it reads, so a screen that reads all current list lines (100k+ rows) pays the check 100k+ times:
-- the item file took 12,755 ms in the owner's browser (prod cd7e983, after the set-based query rewrite #29908).
-- Written as (SELECT perfume.is_owner()) the same rule is evaluated once per query (an init plan) and its answer reused.
-- Same rule, same tables, same FORCE RLS; only policies whose rule is exactly perfume.is_owner() change (desk_users keeps its own).
-- Idempotent: a policy already in the new form no longer matches.

BEGIN;

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT tablename, policyname FROM pg_policies
     WHERE schemaname = 'perfume' AND qual = 'perfume.is_owner()' AND coalesce(with_check, 'perfume.is_owner()') = 'perfume.is_owner()'
  LOOP
    EXECUTE format('ALTER POLICY %I ON perfume.%I USING ((SELECT perfume.is_owner())) WITH CHECK ((SELECT perfume.is_owner()))', p.policyname, p.tablename);
  END LOOP;
END $$;

COMMIT;
