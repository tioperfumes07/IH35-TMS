-- LST-F27 — mdata.equipment (the trailer register) contradicts the entity ownership model.
--
-- FOUND while verifying LST-F24b on prod. LST-F24/F24b fixed mdata.units (trucks). mdata.equipment
-- (trailers) was never touched and is wrong in four separate ways. Read on prod branch
-- br-fancy-credit-akjnd07a with bypass_rls set in its OWN statement (completeness discriminator
-- satisfied: visible 182 == n_live_tup 182):
--
--     owner    leased_to      n    active   U-prefixed   from_samsara   created
--     USMCA    (not leased)   91   81       91           0              all 2026-07-04
--     TRANSP   TRANSP         87   77        0           82             2026-05-19..06-16
--     TRANSP   (not leased)    4    4        0            0             2026-06-07
--
-- DEFECT 1 — NOT ONE TRAILER IS OWNED BY TRK. Owner ruling 2026-07-29: "trucking is the only owner of
--   the equipment" and "WE DO NOT OWN ASSETS ONLY TRUCKING." Today every trailer is booked to an entity
--   that does not own assets. Depreciation and the fixed-asset register therefore sit in the wrong
--   entity: TRK's balance sheet understates its assets, TRANSP's overstates. On a lender package or a
--   fixed-asset rollforward that is a misstatement, not a cosmetic field.
--
-- DEFECT 2 — 87 SELF-LEASES. TRANSP owns and leases to itself. An entity cannot lease an asset from
--   itself; there is no lease, no rent expense, and no rental income. The correct shape is TRK owns and
--   leases to TRANSP, which is what produces TRK's rental income and TRANSP's rent expense.
--
-- DEFECT 3 — 91 PHANTOM USMCA-OWNED TRAILERS, 81 OF THEM ACTIVE. Every one is `U-` prefixed, every one
--   was created 2026-07-04 in a single bulk import, and none came from Samsara. They are duplicates:
--   all 91 have a real twin by number (0 orphans), 91/91 match the twin's make AND model, 86/91 match
--   the twin's VIN. Same superseded-import pattern as the `U-` rows in mdata.units. USMCA has not begun
--   operating -- plates and IRP are ~2 weeks out -- so a USMCA asset register of 91 trailers is
--   fabricated. Left alone it walks into USMCA's opening balance sheet at launch.
--
-- DEFECT 4 — 4 real trailers carry no lessee at all, so they belong to no operating carrier.
--
-- WHAT THIS MIGRATION DOES
--   · owner_company_id = TRK for every row. TRK is the sole owner of the equipment. (owner_company_id
--     is NOT NULL, so the phantom duplicates cannot be set to "no owner"; TRK matches how LST-F24
--     treated the duplicate `U-` rows in mdata.units, and because those rows stay OUT of the lease set
--     they do not double-count as operating assets.)
--   · currently_leased_to_company_id = TRANSP only for a trailer the company actually operates:
--     not deactivated, not `U-` prefixed, not Sold. Expected 81 rows (77 + 4).
--   · currently_leased_to_company_id = NULL for everything else -- the duplicates, the deactivated, the
--     sold. This is the LST-F24b lesson applied before the fact: never assert an active lease on a row
--     that is not a live asset. That is the exact mistake LST-F24 made on the trucks.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   · It does NOT deactivate the 81 active `U-` duplicates, even though they pollute the active fleet.
--     The owner said he is editing/deactivating superseded rows in the app himself ("I WAS GOING TO EDIT
--     THOSE ONCE IN THE SOFTWARE, DEACTIVATE ETC."). Clearing the false ownership and the false lease is
--     the correctness fix; deciding a row's lifecycle is his. FLAGGED FOR THE OWNER: 81 active duplicate
--     trailers remain visible in the fleet until deactivated.
--   · It does NOT delete anything and does NOT change status.
--   · It does NOT model the simultaneous TRANSP + USMCA lease the owner described. A single
--     currently_leased_to_company_id column cannot express two concurrent lessees; that is a schema
--     limitation, not a data problem, and it needs a real lease table before USMCA launches (ASC 842).
--     FLAGGED, not silently worked around.
--
-- IDEMPOTENT: every UPDATE is guarded by IS DISTINCT FROM, so a second run changes 0 rows.
-- AUDITED: trg_audit_equipment writes an append-only audit.row_changes entry per changed row, so every
-- prior value stays recoverable. NO DDL. NO DELETE. NO status change.

DO $$
DECLARE
  v_trk    uuid;
  v_transp uuid;
  v_owner_fixed  int;
  v_leased_set   int;
  v_lease_cleared int;
  v_bad_owner    int;
  v_bad_lease    int;
BEGIN
  SELECT id INTO v_trk    FROM org.companies WHERE code = 'TRK';
  SELECT id INTO v_transp FROM org.companies WHERE code = 'TRANSP';

  IF v_trk IS NULL OR v_transp IS NULL THEN
    RAISE NOTICE 'LST-F27: TRK or TRANSP not present in org.companies — skipping';
    RETURN;
  END IF;

  -- 1. TRK owns the equipment. All of it.
  UPDATE mdata.equipment
     SET owner_company_id = v_trk
   WHERE owner_company_id IS DISTINCT FROM v_trk;
  GET DIAGNOSTICS v_owner_fixed = ROW_COUNT;

  -- 2. Clear the lease everywhere it is not a live, real, operated trailer.
  UPDATE mdata.equipment
     SET currently_leased_to_company_id = NULL
   WHERE currently_leased_to_company_id IS NOT NULL
     AND ( deactivated_at IS NOT NULL
        OR equipment_number LIKE 'U-%'
        OR status::text = 'Sold' );
  GET DIAGNOSTICS v_lease_cleared = ROW_COUNT;

  -- 3. Lease the live, real trailers to the operating carrier.
  UPDATE mdata.equipment
     SET currently_leased_to_company_id = v_transp
   WHERE deactivated_at IS NULL
     AND equipment_number NOT LIKE 'U-%'
     AND status::text <> 'Sold'
     AND currently_leased_to_company_id IS DISTINCT FROM v_transp;
  GET DIAGNOSTICS v_leased_set = ROW_COUNT;

  -- Fail closed: prove the end state, do not assume the UPDATEs did what they claim.
  SELECT count(*) INTO v_bad_owner
    FROM mdata.equipment WHERE owner_company_id IS DISTINCT FROM v_trk;

  SELECT count(*) INTO v_bad_lease
    FROM mdata.equipment
   WHERE currently_leased_to_company_id IS NOT NULL
     AND ( deactivated_at IS NOT NULL OR equipment_number LIKE 'U-%' OR status::text = 'Sold' );

  RAISE NOTICE 'LST-F27: owner->TRK on % row(s); lease cleared on %; lease->TRANSP on %',
    v_owner_fixed, v_lease_cleared, v_leased_set;

  IF v_bad_owner <> 0 THEN
    RAISE EXCEPTION 'LST-F27: % equipment row(s) still not owned by TRK. Aborting.', v_bad_owner;
  END IF;

  IF v_bad_lease <> 0 THEN
    RAISE EXCEPTION 'LST-F27: % non-operated equipment row(s) still carry a lease. Aborting.', v_bad_lease;
  END IF;
END $$;
