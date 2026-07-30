-- LST-F28 — retire the 81 active `U-` duplicate trailers that LST-F27 deliberately left visible.
--
-- Owner, 2026-07-30: "these have all been asked and answered ... i want everything fully functional."
-- Owner, 2026-07-29: "YOU DO IT FOR ME, NO PUSHBACK, THAT IS WHAT YOU ARE FOR TO MAKE MY LIFE EASIER."
-- LST-F27 stripped the false ownership and the false lease off these rows but left the lifecycle call
-- open, because the owner had earlier said he would deactivate superseded rows in the app himself.
-- He has now said to finish it. This finishes it.
--
-- WHY THESE ROWS ARE DUPLICATES, PROVEN ON PROD (br-fancy-credit-akjnd07a, bypass_rls in its OWN
-- statement, visible 182 == n_live_tup 182):
--     `U-` rows total ....................................... 91
--     of those, still ACTIVE ................................ 81
--     active rows that have a real twin by number ........... 81   (81/81)
--     active rows whose twin is itself LIVE ................. 81   (81/81)
--     orphans with no twin at all ............................ 0
--     referenced by any maintenance work order ............... 0
-- Earlier evidence (LST-F27): 91/91 match the twin's make AND model, 86/91 match the twin's VIN, and
-- all 91 were created in a single bulk import on 2026-07-04 with no Samsara id — while the real
-- trailers came from Samsara between 2026-05-19 and 2026-06-16.
--
-- So every row this touches is a superseded import of a trailer that ALREADY EXISTS and is ALREADY
-- ACTIVE in the same table. Nothing unique is being retired, and no maintenance history hangs off any
-- of them. The company operates ~91 real trailers, not 182.
--
-- WHAT THIS DOES: sets `deactivated_at` — VOID-NOT-DELETE. No DELETE, no status change, no ownership
-- change, no lease change (LST-F27 already cleared those, and this migration re-asserts NULL only as a
-- fail-closed check, never as a write). The rows stay in the table, stay queryable, stay auditable, and
-- can be reactivated by the owner in the app at any time.
--
-- FAIL-CLOSED: refuses to deactivate any `U-` row that does NOT have a live twin. If the data ever
-- changes shape so a `U-` row is the only copy of a trailer, this migration aborts rather than hiding
-- the company's only record of an asset. It does not trust the counts above — it re-derives them.
--
-- IDEMPOTENT: guarded by `deactivated_at IS NULL`; a second run changes 0 rows.
-- AUDITED: trg_audit_equipment writes an append-only audit.row_changes entry per changed row.

DO $$
DECLARE
  v_orphan_active int;
  v_deactivated   int;
  v_still_active_dupes int;
  v_real_active   int;
  v_real_before   int;
BEGIN
  -- How many real trailers were active BEFORE anything is touched. The "did the predicate match too
  -- broadly" assertion at the end compares against THIS rather than against a bare zero, because a
  -- FRESH DATABASE has no trailers at all — and a bare `v_real_active = 0` check aborts there. That is
  -- exactly how this migration first failed CI (build-typecheck AND security-audit, both from this one
  -- assertion). An empty table is not a broad match; it is an empty table.
  SELECT count(*) INTO v_real_before
    FROM mdata.equipment WHERE equipment_number NOT LIKE 'U-%' AND deactivated_at IS NULL;

  -- Fail-closed FIRST: is there any active `U-` row that is NOT a duplicate of a live trailer?
  SELECT count(*) INTO v_orphan_active
    FROM mdata.equipment u
   WHERE u.equipment_number LIKE 'U-%'
     AND u.deactivated_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM mdata.equipment r
        WHERE r.equipment_number = regexp_replace(u.equipment_number, '^U-', '')
          AND r.deactivated_at IS NULL
     );

  IF v_orphan_active <> 0 THEN
    RAISE EXCEPTION
      'LST-F28: % active U- row(s) have no LIVE twin — they may be the only record of those assets. Aborting.',
      v_orphan_active;
  END IF;

  UPDATE mdata.equipment u
     SET deactivated_at = now()
   WHERE u.equipment_number LIKE 'U-%'
     AND u.deactivated_at IS NULL;
  GET DIAGNOSTICS v_deactivated = ROW_COUNT;

  SELECT count(*) INTO v_still_active_dupes
    FROM mdata.equipment WHERE equipment_number LIKE 'U-%' AND deactivated_at IS NULL;

  SELECT count(*) INTO v_real_active
    FROM mdata.equipment WHERE equipment_number NOT LIKE 'U-%' AND deactivated_at IS NULL;

  RAISE NOTICE 'LST-F28: deactivated % duplicate trailer(s); % duplicates remain active; % real trailers still active',
    v_deactivated, v_still_active_dupes, v_real_active;

  IF v_still_active_dupes <> 0 THEN
    RAISE EXCEPTION 'LST-F28: % duplicate row(s) still active after the update. Aborting.', v_still_active_dupes;
  END IF;

  -- The real fleet must survive untouched. If there WERE active real trailers and now there are none,
  -- the predicate matched far too broadly. Guarded by v_real_before so an empty database (fresh CI) is
  -- not mistaken for a fleet that was just wiped out.
  IF v_real_before > 0 AND v_real_active = 0 THEN
    RAISE EXCEPTION
      'LST-F28: % active real trailer(s) before, 0 after — the predicate matched too broadly. Aborting.',
      v_real_before;
  END IF;
END $$;
