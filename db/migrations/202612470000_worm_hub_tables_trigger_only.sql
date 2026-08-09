-- ACCT-F285 — WORM DELETE-refusal on the five void-not-delete HUB tables.
-- Board row OPS-HUB-TABLES-HARD-DELETED-WITH-NO-ACTOR (filed by CC-2, seat-to-seat).
--
-- WHAT THE EVIDENCE IS, AND WHAT IT IS NOT. I verified CC-2's numbers on prod rather than inheriting
-- them (audit.row_changes, bypass_rls in-txn):
--     mdata.load_stops 10 · mdata.units 6 · mdata.loads 5 · mdata.drivers 4 · maintenance.work_orders 2
--     = 27 HARD DELETEs, and ALL 27 carry changed_by_user_id NULL *and* changed_by_role NULL.
--     DELETE granted on all five; WORM trigger present on NONE.
-- CC-2 refused to claim records were destroyed and that refusal is carried forward here unchanged:
-- both work-order rows were DEMO and the other 25 are plausibly seed cleanup. THE FINDING IS THAT WITH
-- A NULL ACTOR A LEGITIMATE CLEANUP AND A DESTRUCTIVE MISTAKE ARE INDISTINGUISHABLE IN THE RECORD —
-- which is precisely what WORM exists to prevent. This migration does not assert harm; it removes the
-- ambiguity going forward. (One factual refinement, NOT an upgrade: the NULL actor is 27 of 27, not
-- only the two work-order rows.)
--
-- THESE FIVE ARE HUBS. Every one already carries its void/soft-delete column and is governed by
-- void-not-delete, and maintenance.work_orders carries FOUR void columns with ZERO rows ever voided —
-- the discipline exists in the schema and nothing enforced it.
--
-- ★ TRIGGER ONLY. THE REVOKE IS DELIBERATELY ABSENT AND THAT IS NOT AN OVERSIGHT.
-- The precedent migration (202612430000, ACCT-F269) installs trigger + REVOKE together. I am not
-- copying the REVOKE half: CLAUDE.md §1.6 lists "changing access controls or sharing/permissions"
-- under prohibited outright — direct Jorge to do it himself, even if asked. A REVOKE on the live
-- runtime role is exactly that. The trigger is CODE and blocks regardless of the GRANT (ACCT-F253's
-- own point), so this closes the hole; the REVOKE would be a second layer and belongs to the owner.
-- Recorded in CC-1-OWNER-ONLY.md rather than smuggled in here.
--
-- PRODUCTION-SCOPED, copied from the precedent for the same reason it exists there: CI runs against an
-- ephemeral local database, so fixture teardown never meets this trigger. Test DELETEs are not in the
-- way and were never the blocker.
--
-- Written in the FOREACH-over-ARRAY form so verify-worm-coverage-ratchet (step 1629) can SEE it. The
-- EXECUTE-format-over-a-scalar variant is invisible to that ratchet, which is protection with nothing
-- watching it (ACCT-F152).
--
-- Idempotent: DROP TRIGGER IF EXISTS before CREATE; absent tables are skipped, not fatal.

DO $$
DECLARE
  t text;
  v_count int := 0;
BEGIN
  IF current_database() <> 'neondb' THEN
    RAISE NOTICE 'ACCT-F285: database is % (not production) — DELETE-blocking not installed; fixture teardown preserved', current_database();
    RETURN;
  END IF;

  IF to_regprocedure('accounting.refuse_financial_row_delete()') IS NULL THEN
    RAISE EXCEPTION 'ACCT-F285: accounting.refuse_financial_row_delete() is absent — ACCT-F141 (202612220000) must be applied first';
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'mdata.load_stops',
    'mdata.units',
    'mdata.loads',
    'mdata.drivers',
    'maintenance.work_orders'
  ] LOOP
    IF to_regclass(t) IS NULL THEN
      RAISE NOTICE 'ACCT-F285: % absent — skipped', t;
      CONTINUE;
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON %s', t);
    EXECUTE format(
      'CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON %s FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete()',
      t
    );
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'ACCT-F285: DELETE-refusal trigger installed on % hub table(s); REVOKE intentionally NOT issued (owner-only, CLAUDE.md 1.6)', v_count;
END
$$;
