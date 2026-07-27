-- [HOLD-FOR-JORGE — TIER 1 FINANCIAL] FUEL-03 follow-on: unit_id FK on fuel.fuel_card_overage_events.
--
-- *** DO NOT RUN ON PROD via db:migrate. Owner/agent Neon-applies then ledger-backfills. ***
--
-- Parent migration 202609090010 created unit_id as a bare uuid; verify-linkage-required-edges
-- correctly fails UNENFORCED POINTER. Additive only; idempotent.
-- RENUMBER 2026-07-27 (BAND FIX): was 202609260000 then 202609280000 — Cursor band is 20260901xxxx–20260910xxxx.
-- Body unchanged; Neon dual-ledger stamp for 202609090020_*.

DO $$
BEGIN
  IF to_regclass('fuel.fuel_card_overage_events') IS NULL THEN
    RAISE NOTICE 'fuel.fuel_card_overage_events missing — skip unit_id FK';
    RETURN;
  END IF;

  IF to_regclass('mdata.units') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'fuel_card_overage_events_unit_fkey'
         AND conrelid = 'fuel.fuel_card_overage_events'::regclass
     ) THEN
    ALTER TABLE fuel.fuel_card_overage_events
      ADD CONSTRAINT fuel_card_overage_events_unit_fkey
      FOREIGN KEY (unit_id) REFERENCES mdata.units(id);
  END IF;
END $$;
