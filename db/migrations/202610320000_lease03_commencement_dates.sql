-- LEASE-03 — the commencement dates LEASE-01/02 deliberately left NULL.
--
-- OWNER, 2026-07-30 (verbatim): "transportation since january 01 2022 until present day, usmca from
-- 08 of august 07, 2026."
--
-- LEASE-01/02 set commenced_on NULL on purpose rather than fabricating a legal date, because a lease
-- commencement date lands on an ASC 842 schedule that a CPA, lender or court reads as authoritative.
-- The owner has now supplied them, so they are recorded — from his instruction, not inferred.
--
--   TRANSP -> 2022-01-01, still running ("until present day", so ended_on stays NULL / open term)
--   USMCA  -> 2026-08-07
--
-- ONE READING STATED, NOT SILENTLY CHOSEN: "08 of august 07, 2026" is read as 2026-08-07 (August 7).
-- The trailing "07, 2026" is taken as the day and year. This is flagged in the PR so a one-word
-- correction changes it; it is NOT presented as certain. USMCA is also consistent with the owner's
-- 2026-07-29 note that plates and IRP were about two weeks out.
--
-- WHY A FUTURE DATE IS CORRECT FOR USMCA AND NOT A DEFECT: the lease is agreed now and commences when
-- the entity starts operating. ASC 842 measures at the COMMENCEMENT date — when the asset is made
-- available to the lessee — so a commencement date ahead of today is exactly right for an entity that
-- has not begun operating. No CHECK forbids it, and none should.
--
-- SCOPE: dates only. No rates, no classification change, no posting. Idempotent: only rows whose
-- commenced_on IS NULL are set, so re-running changes nothing and a later hand-correction is never
-- overwritten.

DO $$
DECLARE
  v_transp uuid;
  v_usmca  uuid;
  v_leases_transp int;
  v_leases_usmca  int;
  v_contracts     int;
  v_still_null    int;
BEGIN
  SELECT id INTO v_transp FROM org.companies WHERE code = 'TRANSP';
  SELECT id INTO v_usmca  FROM org.companies WHERE code = 'USMCA';

  IF v_transp IS NULL OR v_usmca IS NULL THEN
    RAISE NOTICE 'LEASE-03: TRANSP/USMCA not present — skipping (fresh database).';
    RETURN;
  END IF;

  UPDATE mdata.asset_leases
     SET commenced_on = DATE '2022-01-01', updated_at = now()
   WHERE lessee_company_id = v_transp
     AND commenced_on IS NULL
     AND deactivated_at IS NULL;
  GET DIAGNOSTICS v_leases_transp = ROW_COUNT;

  UPDATE mdata.asset_leases
     SET commenced_on = DATE '2026-08-07', updated_at = now()
   WHERE lessee_company_id = v_usmca
     AND commenced_on IS NULL
     AND deactivated_at IS NULL;
  GET DIAGNOSTICS v_leases_usmca = ROW_COUNT;

  -- Contract headers follow their lessee, so a contract and its lines never disagree about when the
  -- term began.
  UPDATE mdata.lease_contracts
     SET commenced_on = CASE WHEN lessee_company_id = v_transp THEN DATE '2022-01-01'
                             WHEN lessee_company_id = v_usmca  THEN DATE '2026-08-07' END,
         updated_at = now()
   WHERE lessee_company_id IN (v_transp, v_usmca)
     AND commenced_on IS NULL
     AND deactivated_at IS NULL;
  GET DIAGNOSTICS v_contracts = ROW_COUNT;

  SELECT count(*) INTO v_still_null
    FROM mdata.asset_leases
   WHERE deactivated_at IS NULL
     AND commenced_on IS NULL
     AND lessee_company_id IN (v_transp, v_usmca);

  RAISE NOTICE 'LEASE-03: TRANSP leases dated %, USMCA leases dated %, contracts dated %; % still undated',
    v_leases_transp, v_leases_usmca, v_contracts, v_still_null;

  -- Fail closed: a lease for either named entity must not survive this migration without a date.
  IF v_still_null <> 0 THEN
    RAISE EXCEPTION
      'LEASE-03: % lease(s) for TRANSP/USMCA still have no commencement date. Aborting.', v_still_null;
  END IF;

  -- An ended_on before its own commencement would be a term that ends before it starts.
  IF EXISTS (SELECT 1 FROM mdata.asset_leases
              WHERE ended_on IS NOT NULL AND commenced_on IS NOT NULL AND ended_on < commenced_on) THEN
    RAISE EXCEPTION 'LEASE-03: a lease ends before it commences. Aborting.';
  END IF;
END $$;
