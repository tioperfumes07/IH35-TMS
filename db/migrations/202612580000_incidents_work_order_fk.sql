-- MAINTENANCE-DAMAGE-REGISTER-CANONICAL-WO-FK — safety.incidents has no canonical FK to the
-- maintenance work order its own auto-workflow creates (auto-workflow-trigger.ts spawns a draft WO
-- for equipment/breakdown incidents and returns maintenance_work_order_id in the API response, but
-- never persists it back onto the incident row). The mounted Maintenance Damage Register therefore
-- cannot render the approved "Linked WO" relationship without inventing it from description text or
-- audit JSON — MaintenanceDamageRegisterTab.tsx explicitly DEFERRED that column pending this exact
-- additive migration.
--
-- This migration adds a nullable, company-safe FK column so the auto-workflow can stamp it atomically
-- at WO-creation time (paired backend PR) and the read/UI can mount a real EntityLink drill-through.
-- Going-forward only — no backfill (safety.incidents rows created before this migration never had a
-- work order id captured anywhere to backfill from; inventing one from free text is forbidden).
--
-- Idempotent, additive-only, no destructive change. FORCED RLS unchanged (existing table policy already
-- scopes safety.incidents by operating_company_id).

BEGIN;

DO $$
BEGIN
  IF to_regclass('safety.incidents') IS NULL OR to_regclass('maintenance.work_orders') IS NULL THEN
    RAISE NOTICE 'INCIDENTS-WO-FK: safety.incidents or maintenance.work_orders absent — skip';
    RETURN;
  END IF;

  ALTER TABLE safety.incidents
    ADD COLUMN IF NOT EXISTS work_order_id uuid;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incidents_work_order_id_fkey') THEN
    ALTER TABLE safety.incidents
      ADD CONSTRAINT incidents_work_order_id_fkey
      FOREIGN KEY (work_order_id) REFERENCES maintenance.work_orders(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_incidents_work_order_id
  ON safety.incidents (work_order_id)
  WHERE work_order_id IS NOT NULL;

COMMIT;
