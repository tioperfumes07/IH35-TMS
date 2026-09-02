-- GO-22 pre-settlement (owner direct instruction 2026-09-02). book-load.service.ts ~2264 carries
-- TODO P6-FOLLOWUP-PRESETTLEMENT-LINK: "when presettlement query service exists, look up driver's
-- open presettlement here and set presettlement_link_id". Until now it always logs
-- dispatch.load.presettlement_link_deferred and leaves the link NULL. This migration adds the two
-- pieces the query service needs; the service itself + book-load wiring ship in the same PR.
--
-- 1. driver_finance.driver_settlements.tour_id -- an NB leg starts a tour (mdata.loads.tour_id,
--    migration 202606181500) and opens a pre-settlement; TR/SB legs join the SAME tour's open
--    settlement. Matching "same tour" requires the settlement to carry the tour_id it was opened
--    for -- it did not before this column.
-- 2. driver_finance.presettlement_link_suggestions -- "RECOMMEND, NEVER AUTO-COMMIT... a load
--    never joins a settlement silently." Mirrors driver_finance.trip_link_queue's existing
--    suggest/confirm shape (suggested_x/suggested_reason/assigned_x/assigned_by/status) for the
--    load-to-settlement case instead of the expense-to-load case that table already covers.
--
-- Additive only, idempotent. No money posting -- this table only records a recommendation and its
-- resolution; the actual driver_settlements row / mdata.loads.presettlement_link_id write happens
-- in the confirm step, in the application layer, only after a human confirms.
--
-- CANONICAL-CHECK: driver_finance.trip_link_queue is the canonical SUGGEST/CONFIRM queue for
-- expense-to-load (which cost belongs on which load). driver_finance.presettlement_link_suggestions
-- mirrors that shape for a distinct concept: load-to-settlement (which load belongs on which open
-- pre-settlement / tour). Same UX pattern, opposite join direction. It is not a second settlement
-- ledger — driver_finance.driver_settlements remains the money document; this table only stores a
-- pending recommendation until a human confirms. Does not SUPERSEDE trip_link_queue.

BEGIN;

ALTER TABLE driver_finance.driver_settlements
  ADD COLUMN IF NOT EXISTS tour_id uuid NULL;

CREATE INDEX IF NOT EXISTS ix_driver_settlements_tour_open
  ON driver_finance.driver_settlements (operating_company_id, driver_id, tour_id)
  WHERE tour_id IS NOT NULL AND trip_closed_at IS NULL AND voided_at IS NULL;

CREATE TABLE IF NOT EXISTS driver_finance.presettlement_link_suggestions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id    uuid NOT NULL REFERENCES org.companies(id),
  load_id                  uuid NOT NULL REFERENCES mdata.loads(id),
  driver_id                uuid NOT NULL REFERENCES mdata.drivers(id),
  unit_id                  uuid NULL REFERENCES mdata.units(id),
  trip_type                mdata.trip_type_enum NULL,
  tour_id                  uuid NULL,
  -- NULL suggested_settlement_id means "suggest creating a NEW pre-settlement" (the NB case).
  suggested_settlement_id  uuid NULL REFERENCES driver_finance.driver_settlements(id),
  suggested_reason         text NOT NULL,
  assigned_settlement_id   uuid NULL REFERENCES driver_finance.driver_settlements(id),
  assigned_at              timestamptz NULL,
  assigned_by_user_id      uuid NULL REFERENCES identity.users(id),
  status                   text NOT NULL DEFAULT 'pending',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_presettlement_link_suggestions_status'
      AND conrelid = 'driver_finance.presettlement_link_suggestions'::regclass
  ) THEN
    ALTER TABLE driver_finance.presettlement_link_suggestions
      ADD CONSTRAINT chk_presettlement_link_suggestions_status
      CHECK (status IN ('pending', 'confirmed', 'rejected'));
  END IF;
END $$;

-- One pending suggestion per load -- re-booking or re-suggesting refreshes the existing row rather
-- than piling up duplicates for the same load.
CREATE UNIQUE INDEX IF NOT EXISTS uq_presettlement_suggestion_pending_per_load
  ON driver_finance.presettlement_link_suggestions (operating_company_id, load_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS ix_presettlement_suggestions_pending
  ON driver_finance.presettlement_link_suggestions (operating_company_id, created_at DESC)
  WHERE status = 'pending';

DO $presettlement_rls$
BEGIN
  IF to_regclass('driver_finance.presettlement_link_suggestions') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE driver_finance.presettlement_link_suggestions ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE driver_finance.presettlement_link_suggestions FORCE ROW LEVEL SECURITY';
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'driver_finance' AND tablename = 'presettlement_link_suggestions'
      AND policyname = 'presettlement_link_suggestions_tenant'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY presettlement_link_suggestions_tenant ON driver_finance.presettlement_link_suggestions
        FOR ALL
        USING (
          identity.is_lucia_bypass()
          OR operating_company_id::text = current_setting('app.operating_company_id', true)
        )
        WITH CHECK (
          identity.is_lucia_bypass()
          OR operating_company_id::text = current_setting('app.operating_company_id', true)
        )
    $policy$;
  END IF;
  EXECUTE 'GRANT SELECT, INSERT, UPDATE ON driver_finance.presettlement_link_suggestions TO ih35_app';
  EXECUTE 'REVOKE DELETE ON driver_finance.presettlement_link_suggestions FROM ih35_app';
  EXECUTE 'REVOKE ALL ON driver_finance.presettlement_link_suggestions FROM PUBLIC';
END
$presettlement_rls$;

COMMENT ON COLUMN driver_finance.driver_settlements.tour_id IS
  'GO-22 -- mirrors mdata.loads.tour_id (migration 202606181500). An NB leg opens a settlement carrying its tour_id; TR/SB legs of the same tour join it.';
COMMENT ON TABLE driver_finance.presettlement_link_suggestions IS
  'GO-22 -- suggest-then-confirm queue for linking a booked load to a pre-settlement. Mirrors driver_finance.trip_link_queue''s shape. A load never joins a settlement silently -- confirmation is a human, logged action.';

COMMIT;
