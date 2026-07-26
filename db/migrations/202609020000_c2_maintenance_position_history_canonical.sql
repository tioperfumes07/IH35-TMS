-- 202609020000_c2_maintenance_position_history_canonical.sql
--
-- HELD — DO NOT RUN ON PROD until owner Neon-applies.
--
-- [HOLD-FOR-JORGE — TIER 1 · SCHEMA/BACKFILL] SWEEP-C2 (class-sweep 2026-07-26) repoint 1 of 2:
-- apps/backend/src/safety/position-history/position-history.routes.ts is the ONLY backend consumer
-- (read + write) of maint.position_history / maint.position_set / maint.part, and is a confirmed
-- LIVE WRITER (INSERT) into the RETIRE-class `maint` schema per LINKAGE-LAW rule 14 / verify-step 1521
-- (verify-no-retire-table-writes.mjs KNOWN_LEGACY) and the SWEEP-C2 write-inventory guard baseline
-- (scripts/verify-sweep-c2-no-retire-writes.baseline.json:
-- "safety/position-history/position-history.routes.ts:178::INSERT INTO maint.position_history").
--
-- ROOT CAUSE: position_history was built (202606122230_m2_position_history.sql) directly under the
-- retired `maint` schema instead of the canonical `maintenance` schema every other M2+ maintenance
-- table uses (maintenance.parts_inventory, maintenance.pm_schedules, maintenance.work_orders, ...).
-- No later migration ever moved it — a straight class-membership miss, not a deliberate design
-- decision (contrast catalogs.load_cancellation_reasons, which IS a documented, owner-approved
-- exception per governance/void-cancel-executors.ts).
--
-- FIX (this migration, schema half): create the canonical maintenance.position_history table —
-- IDENTICAL column/constraint/index shape to maint.position_history — and copy every existing row
-- across (idempotent ON CONFLICT DO NOTHING copy, safe on zero rows AND on a full prod table; safe to
-- re-run). maint.position_set / maint.part are UNCHANGED and NOT retired here — position_set has no
-- canonical replacement yet and maint.part still has other live readers
-- (apps/backend/src/integrity/driver-metrics.service.ts) outside this block's ~5-writer scope; the FK
-- targets on the new table still point at maint.position_set(id) / maint.part(id) so no data/behavior
-- changes beyond the schema move. The application-code half (repointing the route file's 4 endpoints
-- to maintenance.position_history) ships in the SAME PR, gated by this migration landing first.
--
-- Never DROPS maint.position_history (Rule 07 archive-only) — it is COMMENT-marked DEPRECATED, kept
-- in place with its data intact, readable via the KNOWN_LEGACY tier until a future block promotes the
-- whole `maint` schema to fully ENFORCED and physically retires it.
--
-- POSTS NOTHING — no GL account, no journal entry, no amount, no feature flag. Idempotent
-- (CREATE TABLE/INDEX IF NOT EXISTS, ON CONFLICT DO NOTHING copy, DROP POLICY IF EXISTS + CREATE).
-- No hardcoded UUID literal; no org.companies lookup needed (this table has no per-company seed).

BEGIN;

DO $$
BEGIN
  IF to_regclass('maint.position_set') IS NULL OR to_regclass('mdata.units') IS NULL THEN
    RAISE NOTICE 'maint.position_set or mdata.units absent — skipping maintenance.position_history creation (fresh-DB CI ordering)';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS maintenance.position_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
    unit_id uuid NOT NULL REFERENCES mdata.units(id) ON DELETE CASCADE,
    unit_type text NOT NULL CHECK (unit_type IN ('truck', 'trailer', 'reefer')),
    position_set_id uuid NOT NULL REFERENCES maint.position_set(id) ON DELETE CASCADE,
    position_code text NOT NULL,
    part_id uuid REFERENCES maint.part(id) ON DELETE SET NULL,
    part_number text,
    action text NOT NULL CHECK (action IN ('installed', 'removed', 'replaced')),
    action_reason text,
    actor_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    actor_name text,
    action_at timestamptz NOT NULL DEFAULT now(),
    source_type text CHECK (source_type IN ('work_order', 'manual_entry', 'bulk_import')),
    source_id uuid,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT position_history_position_check CHECK (
      (part_id IS NOT NULL AND action = 'removed') OR
      (part_id IS NOT NULL) OR
      (action = 'removed' AND part_id IS NULL)
    )
  );
END
$$;

CREATE INDEX IF NOT EXISTS idx_maintenance_position_history_company
  ON maintenance.position_history (operating_company_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_position_history_unit
  ON maintenance.position_history (unit_id, action_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_position_history_position
  ON maintenance.position_history (position_set_id, position_code, action_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_position_history_part
  ON maintenance.position_history (part_id, action_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_position_history_actor
  ON maintenance.position_history (actor_id, action_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_position_history_action_at
  ON maintenance.position_history (action_at DESC);

-- Entity-scoped FORCED RLS (canonical predicate — matches every other maintenance.* M2+ table).
DO $$
BEGIN
  IF to_regclass('maintenance.position_history') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE maintenance.position_history ENABLE ROW LEVEL SECURITY;
  ALTER TABLE maintenance.position_history FORCE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS position_history_entity_scope ON maintenance.position_history;
  CREATE POLICY position_history_entity_scope
    ON maintenance.position_history
    FOR ALL TO ih35_app
    USING (
      identity.is_lucia_bypass()
      OR operating_company_id::text = current_setting('app.operating_company_id', true)
    )
    WITH CHECK (
      identity.is_lucia_bypass()
      OR operating_company_id::text = current_setting('app.operating_company_id', true)
    );
END
$$;

-- Append-only audit trail of part installs/removals — SELECT/INSERT only, no UPDATE/DELETE (mirrors
-- the retired table's own grant: maint.position_history was SELECT, INSERT only, never UPDATE/DELETE).
-- The `maintenance` schema carries ALTER DEFAULT PRIVILEGES that auto-grant UPDATE/DELETE to ih35_app
-- on every new table (verified live: a narrow GRANT alone left UPDATE+DELETE in place), so the narrow
-- GRANT is NOT sufficient on its own — explicitly REVOKE the two write verbs this table must never have.
GRANT SELECT, INSERT ON maintenance.position_history TO ih35_app;
REVOKE UPDATE, DELETE ON maintenance.position_history FROM ih35_app;

-- One-time, idempotent copy of every existing row. ON CONFLICT DO NOTHING makes re-runs a no-op; the
-- deterministic id carries over unchanged so this is a pure schema relocation, not a data rewrite.
DO $$
BEGIN
  IF to_regclass('maint.position_history') IS NULL OR to_regclass('maintenance.position_history') IS NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('app.bypass_rls', 'lucia', true);

  INSERT INTO maintenance.position_history (
    id, operating_company_id, unit_id, unit_type, position_set_id, position_code,
    part_id, part_number, action, action_reason, actor_id, actor_name, action_at,
    source_type, source_id, notes, created_at
  )
  SELECT
    id, operating_company_id, unit_id, unit_type, position_set_id, position_code,
    part_id, part_number, action, action_reason, actor_id, actor_name, action_at,
    source_type, source_id, notes, created_at
  FROM maint.position_history
  ON CONFLICT (id) DO NOTHING;
END
$$;

-- Archive-not-delete (Rule 07): mark the retired table, keep its data reachable via KNOWN_LEGACY reads.
DO $$
BEGIN
  IF to_regclass('maint.position_history') IS NOT NULL THEN
    EXECUTE format(
      'COMMENT ON TABLE maint.position_history IS %L',
      'DEPRECATED 2026-09-02 (SWEEP-C2): superseded by maintenance.position_history. Kept per ARCHIVE-not-DELETE policy (Rule 07). All rows copied forward; the live route no longer writes here.'
    );
  END IF;

  IF to_regclass('maintenance.position_history') IS NOT NULL THEN
    EXECUTE format(
      'COMMENT ON TABLE maintenance.position_history IS %L',
      'CANONICAL M2 position-history (SWEEP-C2). Single source of truth for positioned-part install/remove/replace events. Superseded maint.position_history 2026-09-02.'
    );
  END IF;
END
$$;

COMMIT;

-- Verification (read-only; harmless on re-run) --------------------------------------------------------
SELECT
  to_regclass('maintenance.position_history') IS NOT NULL AS canonical_table_present,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'maintenance' AND tablename = 'position_history') AS policy_count,
  (CASE WHEN to_regclass('maint.position_history') IS NOT NULL AND to_regclass('maintenance.position_history') IS NOT NULL
     THEN (SELECT COUNT(*) FROM maint.position_history) - (SELECT COUNT(*) FROM maintenance.position_history)
     ELSE NULL END) AS row_count_delta_legacy_minus_canonical;
