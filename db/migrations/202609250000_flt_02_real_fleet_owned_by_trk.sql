-- [HOLD-FOR-JORGE — DATA FIX] DO NOT RUN ON PROD — already applied there by hand this session; this
-- file exists so a fresh DB (CI / local / a new Neon branch) reaches the SAME state, and so the fix is
-- in the repo record rather than living only as an untracked manual UPDATE.
--
-- FLT-02 — the real fleet was owned by the wrong entity.
--
-- ENTITY MODEL (ih35-entity-facts + §4): TRK is the ASSET HOLDER — it owns the trucks. TRANSP is the
-- OPERATING CARRIER — it runs them under lease. So a real unit is `owner_company_id = TRK` with
-- `currently_leased_to_company_id = TRANSP`. mdata.units deliberately has NO operating_company_id;
-- ownership + lease ARE its entity scoping (a recurring 500 source when code assumes otherwise).
--
-- PROD TRUTH verified on br-fancy-credit-akjnd07a 2026-07-26 (bypass_rls='lucia', positive control
-- mdata.vendors=2789):
--   * 87 of 87 non-sample units already owner=TRK / leased_to=TRANSP  -> this migration is a NO-OP on prod
--   * 0 non-sample units owned by anything other than TRK
--   * 93 USMCA-owned units exist and ALL 93 are is_sample_data=true  -> FLT-03 is sample pollution,
--     NOT a cross-entity isolation breach. This migration therefore does NOT touch them: re-homing
--     fixtures would destroy the evidence that they ARE fixtures, which is what FLT-07 needs.
--
-- SCOPE NOTE (owner ruling §9.8): `is_sample_data` is NOT trustworthy as a general selector — it has
-- been wrong on real rows before, and it is BANNED as a delete-selector. It is used here only to
-- EXCLUDE fixtures from an ownership correction, never to select rows for destruction, and the
-- migration is a no-op wherever ownership is already right. Nothing is deleted; nothing is voided.
--
-- Idempotent (the WHERE clause is the guard: rows already correct are not touched). Dynamic
-- org.companies resolution — NO hardcoded UUID (a fresh-from-0001 CI DB seeds gen_random_uuid()).

DO $$
DECLARE
  v_trk    uuid;
  v_transp uuid;
  v_moved  int := 0;
BEGIN
  SELECT id INTO v_trk    FROM org.companies WHERE code = 'TRK';
  SELECT id INTO v_transp FROM org.companies WHERE code = 'TRANSP';

  IF v_trk IS NULL OR v_transp IS NULL THEN
    RAISE NOTICE 'FLT-02: TRK and/or TRANSP absent in org.companies — skipping (fresh DB without the entity seed)';
    RETURN;
  END IF;

  UPDATE mdata.units u
     SET owner_company_id               = v_trk,
         currently_leased_to_company_id = v_transp
   WHERE COALESCE(u.is_sample_data, false) = false
     AND (u.owner_company_id IS DISTINCT FROM v_trk
       OR u.currently_leased_to_company_id IS DISTINCT FROM v_transp);

  GET DIAGNOSTICS v_moved = ROW_COUNT;
  RAISE NOTICE 'FLT-02: % real unit(s) re-homed to owner=TRK / leased_to=TRANSP (0 expected on prod — already applied)', v_moved;
END $$;

COMMENT ON COLUMN mdata.units.owner_company_id IS
  'FLT-02: the ASSET HOLDER that owns this unit — TRK for every real unit. Paired with currently_leased_to_company_id (TRANSP, the operating carrier). mdata.units has NO operating_company_id; these two columns ARE its entity scoping.';
