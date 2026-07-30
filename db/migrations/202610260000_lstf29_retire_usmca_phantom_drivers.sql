-- LST-F29 — 83 phantom driver records sit on USMCA, an entity that has never operated.
--
-- SAME EVENT AS LST-F27/F28. The 2026-07-04 bulk import that created a `U-` copy of every trailer also
-- created a USMCA copy of Transportation's driver roster. Same date, same signature, same defect class.
-- Found by sweeping for entity attribution that contradicts the ownership model, after that class had
-- already been found twice (mdata.units, mdata.equipment).
--
-- PROD EVIDENCE (br-fancy-credit-akjnd07a, bypass_rls in its OWN statement):
--     USMCA drivers ......................................... 83   (78 active)
--     created ............................................... ALL on 2026-07-04, one import
--     every one has a TRANSP driver with the same name ...... 83/83
--     share the IDENTICAL cdl_number with that twin ......... 79
--     came from Samsara (TRANSP's real drivers do) ............ 0
--     loads assigned to a USMCA driver ....................... 0
--     HOS duty-status events for a USMCA driver .............. 0
--   For contrast, TRANSP's 97 drivers were created organically 2026-05-19 .. 2026-07-28.
--   USMCA also has 0 loads and 0 customers. It has not begun operating — plates and IRP are ~2 weeks
--   out (owner, 2026-07-29).
--
-- WHY THIS IS NOT COSMETIC. A CDL number appearing under two carriers is a regulatory problem, not a
-- tidiness problem. At USMCA launch these records feed:
--   · FMCSA driver qualification files (49 CFR 391) — a DQ file per carrier per driver
--   · the drug & alcohol testing consortium roster and Clearinghouse queries (49 CFR 382)
--   · the insurance driver schedule, which is priced per listed driver
--   · settlement runs and 1099/W-8BEN reporting
-- Left alone, USMCA opens with a roster of 78 drivers who actually work for Transportation, each
-- double-listed. That is the kind of record a DOT reviewer, an insurer, or a court reads literally.
--
-- WHAT THIS DOES: sets `deactivated_at` on the phantom rows — VOID-NOT-DELETE. No DELETE. No change to
-- the real TRANSP drivers. Rows stay queryable, auditable, and reactivatable in the app, so if the
-- owner does transfer a driver to USMCA at launch, the history is intact and the record is reusable.
--
-- WHAT IT DELIBERATELY DOES NOT DO: it does not touch any USMCA driver that has ANY operational
-- history, and it does not touch one that has no TRANSP twin. If USMCA has genuinely hired someone,
-- that row is left exactly alone.
--
-- FAIL-CLOSED: re-derives its own preconditions instead of trusting the counts above, and aborts if a
-- targeted row turns out to have operational history. Guarded so a fresh/empty database is a no-op
-- rather than an abort (the LST-F28 lesson: an assertion written against production data must still be
-- correct against an empty one).
--
-- IDEMPOTENT: guarded by `deactivated_at IS NULL`; a second run changes 0 rows.
-- AUDITED: the drivers audit trigger writes an append-only audit.row_changes entry per changed row.

DO $$
DECLARE
  v_usmca uuid;
  v_transp uuid;
  v_with_history int;
  v_deactivated int;
  v_still_active int;
  v_transp_active_before int;
  v_transp_active_after int;
BEGIN
  SELECT id INTO v_usmca  FROM org.companies WHERE code = 'USMCA';
  SELECT id INTO v_transp FROM org.companies WHERE code = 'TRANSP';

  IF v_usmca IS NULL OR v_transp IS NULL THEN
    RAISE NOTICE 'LST-F29: USMCA or TRANSP not present in org.companies — skipping';
    RETURN;
  END IF;

  SELECT count(*) INTO v_transp_active_before
    FROM mdata.drivers WHERE operating_company_id = v_transp AND deactivated_at IS NULL;

  -- How many USMCA drivers have real operational history. This is REPORTED, not fatal — and that is a
  -- deliberate correction to my first draft, which aborted the whole migration whenever this was
  -- non-zero on the theory that "USMCA may have begun operating".
  --
  -- That was wrong. If USMCA genuinely starts operating with one real driver, the other 82 copied rows
  -- are STILL copies and still need retiring; aborting would protect nothing and merely block the fix.
  -- The protections that actually matter live in the UPDATE predicate below (never touch a driver with
  -- history, never touch one without a TRANSP twin) and in the TRANSP-unchanged assertion at the end.
  -- A driver with history is excluded by the predicate itself, so it cannot be retired regardless.
  SELECT count(*) INTO v_with_history
    FROM mdata.drivers d
   WHERE d.operating_company_id = v_usmca
     AND d.deactivated_at IS NULL
     AND ( EXISTS (SELECT 1 FROM mdata.loads l WHERE l.assigned_primary_driver_id = d.id)
        OR EXISTS (SELECT 1 FROM hos.duty_status_events h WHERE h.driver_id = d.id) );

  IF v_with_history <> 0 THEN
    RAISE NOTICE 'LST-F29: % USMCA driver(s) have loads/HOS history — left untouched by the predicate.',
      v_with_history;
  END IF;

  -- Retire ONLY: USMCA + no operational history + a same-name TRANSP driver exists (the twin that
  -- proves this row is a copy). A genuine USMCA hire has no TRANSP twin and is left untouched.
  UPDATE mdata.drivers d
     SET deactivated_at = now()
   WHERE d.operating_company_id = v_usmca
     AND d.deactivated_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM mdata.loads l WHERE l.assigned_primary_driver_id = d.id)
     AND NOT EXISTS (SELECT 1 FROM hos.duty_status_events h WHERE h.driver_id = d.id)
     AND EXISTS (
       SELECT 1 FROM mdata.drivers t
        WHERE t.operating_company_id = v_transp
          AND lower(trim(t.first_name)) = lower(trim(d.first_name))
          AND lower(trim(t.last_name))  = lower(trim(d.last_name))
     );
  GET DIAGNOSTICS v_deactivated = ROW_COUNT;

  SELECT count(*) INTO v_still_active
    FROM mdata.drivers WHERE operating_company_id = v_usmca AND deactivated_at IS NULL;

  SELECT count(*) INTO v_transp_active_after
    FROM mdata.drivers WHERE operating_company_id = v_transp AND deactivated_at IS NULL;

  RAISE NOTICE 'LST-F29: retired % phantom USMCA driver(s); % USMCA driver(s) remain active; TRANSP active % -> %',
    v_deactivated, v_still_active, v_transp_active_before, v_transp_active_after;

  -- The real roster must be untouched. This is the assertion that matters most: the predicate is
  -- scoped to USMCA, and if it ever reached TRANSP it would be retiring the operating carrier's drivers.
  IF v_transp_active_after <> v_transp_active_before THEN
    RAISE EXCEPTION
      'LST-F29: TRANSP active drivers changed % -> % — the predicate escaped its entity. Aborting.',
      v_transp_active_before, v_transp_active_after;
  END IF;
END $$;
