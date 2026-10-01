-- 202615110000_fuel_transaction_derivations.sql
-- ORDERS-2026-10-01 CC-2 rows 5-6 (owner order 2026-10-01, no handoff —
-- docs/bus/2026-10-01-OWNER-ORDER-CC-2-NO-HANDOFF-BUILD-OWN-MIGRATIONS.md).
-- 125 USMCA diesel rows carry a date and no time of day; apps/backend/src/fuel/fuel-time-derivation.service.ts
-- derives the pump time and the IFTA state from the truck's own dwell inside a fuel-stop geofence.
-- This is that engine's OWN output table. It never writes fuel.fuel_transactions: transaction_at and
-- every source field stay exactly as the source delivered them.
--
-- ADDITIVE + IDEMPOTENT. FORCED RLS (canonical predicate), grants to ih35_app, the shared
-- audit.tg_audit_row() trigger. One row per fuel transaction; nothing deletable (no cascade).

BEGIN;

CREATE TABLE IF NOT EXISTS fuel.fuel_transaction_derivations (
  fuel_transaction_id uuid PRIMARY KEY REFERENCES fuel.fuel_transactions(id),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  transaction_at_derived timestamptz NULL,
  state_derived text NULL,
  derived_from_kind text NULL CHECK (derived_from_kind IN ('unit_stop_event', 'vehicle_locations_dwell')),
  derived_from_ref text NULL,
  geofence_id uuid NULL REFERENCES geo.geofences(id),
  confidence text NULL CHECK (confidence IN ('high', 'medium')),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  derived_at timestamptz NOT NULL DEFAULT now(),
  CHECK (transaction_at_derived IS NULL OR (derived_from_kind IS NOT NULL AND derived_from_ref IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_fuel_txn_derivations_company ON fuel.fuel_transaction_derivations (operating_company_id, derived_at DESC);

ALTER TABLE fuel.fuel_transaction_derivations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel.fuel_transaction_derivations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fuel_transaction_derivations_entity_scope ON fuel.fuel_transaction_derivations;
CREATE POLICY fuel_transaction_derivations_entity_scope ON fuel.fuel_transaction_derivations
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true));

GRANT USAGE ON SCHEMA fuel TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON fuel.fuel_transaction_derivations TO ih35_app;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE t.tgrelid = 'fuel.fuel_transaction_derivations'::regclass AND p.proname = 'tg_audit_row' AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER trg_audit_fuel_transaction_derivations AFTER INSERT OR UPDATE OR DELETE
      ON fuel.fuel_transaction_derivations FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
  END IF;
END
$$;

COMMIT;
