-- LST-F24 — unit ownership corrected to the owner's stated model.
--
-- OWNER RULING (2026-07-29, verbatim): "usmca or transportation do not own that equipment, they are
-- not purchasing that equipment... the same units trucking owns it leases to both transportation and
-- to usmca." And, the same day: "all units are leased at the same time, simultaneously... trucking is
-- the only owner of the equipment. usmca has not begun operating, in 2 weeks we will take out license
-- plates and irp etc."
--
-- LIVE STATE BEFORE (prod br-fancy-credit-akjnd07a, complete read: visible 186 == n_live_tup 186):
--     owner=USMCA        lease=(none)     93 units   <- USMCA owns no equipment
--     owner=TRK          lease=TRANSP     87 units   <- already correct
--     owner=TRANSP       lease=TRANSP      5 units   <- wrong owner
--     owner=TRANSP       lease=(none)      1 unit    <- wrong owner + no lease
--   99 units carry an owner the business model forbids; 94 have no lessee recorded at all.
--
-- TARGET: every unit owner = TRK; every unit currently_leased_to = TRANSP.
--
-- WHY TRANSP AND NOT USMCA, stated so it is auditable: USMCA HAS NOT BEGUN OPERATING (owner,
-- 2026-07-29; plates and IRP are ~2 weeks out). config/samsara-carrier-attribution.json agrees on
-- both points -- `owner_company_id_for_all` is the TRK id, the USMCA lease rule carries
-- `"active": false`, and `default_lease` is TRANSP. Assigning any unit to USMCA today would record a
-- lease to an entity that is not yet operating and has no plates or IRP.
--
-- The lessee is NOT inferred from the current `owner_company_id`: that column is the very field this
-- migration exists to correct, so reading it to derive the lessee would be circular reasoning on
-- corrupt data. It is also not inferred from Samsara tags -- verified on prod, ALL 99 wrong-owner
-- units have NO samsara_vehicles row at all, so that evidence does not exist for exactly the rows
-- being fixed. The lessee comes from the owner's ruling plus the config default, and nothing else.
--
-- AUDIT: mdata.units carries trigger trg_audit_units (AFTER INSERT OR UPDATE OR DELETE ->
-- audit.tg_audit_row), so every row changed here writes an append-only audit.row_changes entry
-- automatically. No audit rows are written by hand.
--
-- IDEMPOTENT: each UPDATE is guarded by IS DISTINCT FROM, so a second run changes 0 rows.
-- REVERSIBLE: prior values are preserved in audit.row_changes by the trigger above.
-- NOT A DELETE: no row is removed; only two FK columns are corrected.

DO $$
DECLARE
  v_trk    uuid;
  v_transp uuid;
  v_owner_fixed  int;
  v_lease_fixed  int;
  v_total        int;
  v_correct      int;
BEGIN
  -- Resolve entities dynamically. Never hardcode an operating_company_id in a migration.
  SELECT id INTO v_trk    FROM org.companies WHERE code = 'TRK'    LIMIT 1;
  SELECT id INTO v_transp FROM org.companies WHERE code = 'TRANSP' LIMIT 1;

  IF v_trk IS NULL OR v_transp IS NULL THEN
    RAISE EXCEPTION 'LST-F24: could not resolve TRK (%) or TRANSP (%) from org.companies', v_trk, v_transp;
  END IF;

  SELECT count(*) INTO v_total FROM mdata.units;
  RAISE NOTICE 'LST-F24 BEFORE: % units total', v_total;

  -- 1. Trucking is the ONLY owner of the equipment.
  UPDATE mdata.units
     SET owner_company_id = v_trk
   WHERE owner_company_id IS DISTINCT FROM v_trk;
  GET DIAGNOSTICS v_owner_fixed = ROW_COUNT;

  -- 2. Every unit is currently leased to the operating carrier. USMCA is not operating yet.
  UPDATE mdata.units
     SET currently_leased_to_company_id = v_transp
   WHERE currently_leased_to_company_id IS DISTINCT FROM v_transp;
  GET DIAGNOSTICS v_lease_fixed = ROW_COUNT;

  SELECT count(*) INTO v_correct
    FROM mdata.units
   WHERE owner_company_id = v_trk
     AND currently_leased_to_company_id = v_transp;

  RAISE NOTICE 'LST-F24 AFTER: owner corrected on % units, lessee corrected on % units, % of % now owner=TRK lease=TRANSP',
    v_owner_fixed, v_lease_fixed, v_correct, v_total;

  IF v_correct <> v_total THEN
    RAISE EXCEPTION 'LST-F24: expected all % units to be owner=TRK lease=TRANSP, got %', v_total, v_correct;
  END IF;
END $$;
