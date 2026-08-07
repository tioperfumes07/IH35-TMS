-- LINK-F01 — record the honest no-load state on the PRE-TMS-DISPATCH import cohort.
--
-- OWNER RULING 2026-08-04 (docs/lockdown/LOAD-LINKAGE-SCOPE-RULING-2026-08-04.md):
--   "Historical/QBO-imported fuel & expenses are legitimately load-null because the TMS has not
--    dispatched loads yet. Load linkage is going-forward only. NEVER invent a load FK. Mark the
--    historical cohort exempt (load_required=false, load_exemption_reason), guard that *new*
--    TMS-native loads link — nothing more."
--
-- WHY THIS IS NOT A BACKFILL OF INVENTED DATA. It writes no load_id and infers no relationship. It
-- records what is already true: these rows were imported from card/bookkeeping history and were never
-- dispatched through this TMS, so no load exists to attach. Leaving them as bare NULLs is what makes a
-- naive reader (or a naive guard) report "1,548 broken links forever" — which is precisely the
-- expected-state-recorded-as-failure mistake this ruling exists to end.
--
-- COHORT — narrow and evidence-based, not a blanket sweep. Verified on prod 2026-08-04
-- (fuel.fuel_transactions 1,548 rows, bypass in-transaction): every row carries `relay_bridge=1` in
-- notes, i.e. it came through relay-fuel-canonical-bridge.ts, and every row has load_id IS NULL. Only
-- rows matching BOTH conditions are touched:
--     load_id IS NULL  AND  notes ILIKE '%relay_bridge=1%'
-- A TMS-native row (dispatched, categorized in-app) never carries that marker, so it can never be
-- swept up. If a load is later attached to an exempted row, the exemption is cleared by the existing
-- application path (fuel-transactions.routes.ts: "AN ASSIGNED LOAD CLEARS THE EXEMPTION").
--
-- REVERSIBLE + TRACEABLE: the reason string is a single searchable literal, so the cohort can be
-- identified and reverted exactly. No DELETE. Idempotent: re-running matches zero rows.

DO $$
DECLARE
  v_marked integer := 0;
BEGIN
  UPDATE fuel.fuel_transactions f
     SET load_required        = false,
         load_exemption_reason = 'PRE_TMS_DISPATCH_IMPORT',
         updated_at           = now()
   WHERE f.load_id IS NULL
     AND COALESCE(f.notes,'') ILIKE '%relay_bridge=1%'
     AND (f.load_required IS DISTINCT FROM false
          OR f.load_exemption_reason IS DISTINCT FROM 'PRE_TMS_DISPATCH_IMPORT');

  GET DIAGNOSTICS v_marked = ROW_COUNT;
  RAISE NOTICE 'LINK-F01: marked % imported fuel transaction(s) PRE_TMS_DISPATCH_IMPORT', v_marked;
END $$;
