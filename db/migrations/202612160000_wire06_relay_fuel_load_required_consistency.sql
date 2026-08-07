-- CLS-DISP-WIRE-06 / ACCT-F126 — reconcile relay fuel rows that claim to require a load AND carry an
-- exemption reason for not having one.
--
-- ROOT CAUSE (fixed in the same PR, integrations/relay-payments/relay-fuel-canonical-bridge.ts): the
-- bridge INSERT hardcoded `load_required` to the literal true while simultaneously setting
-- `load_exemption_reason = 'relay_ingest_no_load_link'` whenever no load resolved. Every relay ingest
-- without a resolvable load therefore produced a self-contradictory row: "a load is required here"
-- and "here is the reason it is exempt", at once.
--
-- WHY IT MATTERS BEYOND TIDINESS. The going-forward load-linkage ratchet has to distinguish a genuine
-- unlinked TMS-native cost from an import that legitimately has no load. `load_required` is that
-- discriminator. While the bridge keeps minting rows with load_required=true and no load, the ratchet
-- is RED on expected state from its first run — and a guard that is red on correct behaviour gets
-- switched off, which is how the class stays open.
--
-- SCOPE — deliberately the narrowest thing that is true. This touches ONLY rows that are all of:
--   * load_id IS NULL              (no load actually linked)
--   * load_required = true         (claims one is needed)
--   * load_exemption_reason = 'relay_ingest_no_load_link'  (the bridge's own marker)
-- Verified on prod 2026-08-05 (lucia): exactly 4 such rows, all created 2026-08-05 12:00:53Z,
-- source='other', i.e. produced by the bridge after the 1,548-row historical backfill.
--
-- IT DOES NOT TOUCH THE HISTORICAL COHORT. The 1,548 pre-TMS-dispatch imports already carry
-- load_required=false + 'PRE_TMS_DISPATCH_IMPORT' under the owner ruling
-- (LOAD-LINKAGE-SCOPE-RULING-2026-08-04) and are excluded by the reason filter above. Their exemption
-- reason is preserved verbatim — this migration never rewrites a reason, only the boolean that
-- contradicts it.
--
-- NOT A BACKFILL OF LOAD LINKS. No load_id is invented for any row. Load linkage is going-forward
-- only; inventing an FK to make a count look better is precisely what the owner ruling forbids.
--
-- Idempotent by construction: after it runs the WHERE matches nothing, so a re-run is a no-op.

DO $$
DECLARE
  v_fixed bigint;
BEGIN
  IF to_regclass('fuel.fuel_transactions') IS NULL THEN
    RAISE NOTICE 'WIRE-06: fuel.fuel_transactions absent — skipping';
    RETURN;
  END IF;

  UPDATE fuel.fuel_transactions
     SET load_required = false,
         updated_at    = now()
   WHERE load_id IS NULL
     AND load_required IS DISTINCT FROM false
     AND load_exemption_reason = 'relay_ingest_no_load_link';

  GET DIAGNOSTICS v_fixed = ROW_COUNT;
  RAISE NOTICE 'WIRE-06: reconciled % relay fuel row(s) to load_required=false', v_fixed;
END
$$;
