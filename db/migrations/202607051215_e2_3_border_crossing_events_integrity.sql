-- E2-3 — dispatch.border_crossing_events integrity: FKs + operating_company_id uuid + RLS/GRANT
-- =================================================================================================
-- FINDING E2-3: dispatch.border_crossing_events (created 202606080111 / RLS addendum 202606080112)
-- shipped WITHOUT referential integrity and with `operating_company_id` stored as TEXT:
--   * operating_company_id  TEXT  (should be a uuid FK → org.companies(id))
--   * driver_uuid           UUID  (no FK → mdata.drivers(id))
--   * load_uuid             UUID  (no FK → mdata.loads(id))
--   * vehicle_id            TEXT  → this is a SAMSARA EXTERNAL vehicle id (not mdata.units.id); the
--                                   ingest path (samsara border-crossings/detector.service.ts) writes
--                                   the raw Samsara device id here. It is intentionally NOT a local PK
--                                   and therefore gets NO FK. (See BACKFLAG note below.)
--
-- WHAT THIS MIGRATION DOES (additive / integrity only — NO money, NO GL, NO posting, NON-FINANCIAL
-- schema hardening; but bundled here as a HOLD-FOR-JORGE migration because ALL migrations are gated):
--   1. Convert operating_company_id TEXT -> uuid, SAFELY. The conversion is GUARDED: it only runs when
--      the column is still `text` AND every non-null value is a well-formed uuid. If ANY value is
--      non-castable it SKIPS the conversion and RAISEs a NOTICE flagging that a manual backfill is
--      needed (Jorge) — it NEVER does a blind UPDATE and NEVER hard-fails the deploy. On the fresh CI
--      DB the table is empty, so the conversion always runs and the FK below is exercised.
--   2. Recreate the two existing RLS policies in a form that is AGNOSTIC to the final column type
--      (`operating_company_id::text = current_setting(...)` and `operating_company_id::uuid IN (...)`)
--      so RLS keeps working whether or not the type conversion ran. The original policy 0111 compared
--      the bare column to a text GUC — that would break the instant the column became uuid.
--   3. Add the missing FOREIGN KEYs, each guarded (skip if target table absent or constraint exists)
--      and created NOT VALID so the migration cannot fail on any pre-existing drift rows — new writes
--      are fully checked; the near-empty legacy rows are left unvalidated by design (VALIDATE later):
--        - fk_bce_operating_company : operating_company_id -> org.companies(id)   [only if col = uuid]
--        - fk_bce_driver            : driver_uuid          -> mdata.drivers(id)   ON DELETE SET NULL
--        - fk_bce_load              : load_uuid            -> mdata.loads(id)      ON DELETE SET NULL
--      operating_company_id is NOT NULL so its FK uses the default RESTRICT (matches mdata.loads).
--   4. Re-assert the standard tenant guardrails idempotently: ENABLE + FORCE ROW LEVEL SECURITY and
--      the ih35_app schema/table GRANTs (0065 pattern). Harmless where already present.
--
-- IDEMPOTENT: type change is a no-op once the column is already uuid; every policy is DROP ... IF
-- EXISTS + CREATE; every FK is guarded by pg_constraint existence; GRANT/FORCE are naturally
-- re-runnable. Safe to re-run.
--
-- BACKFLAG (needs Jorge): (a) if prod holds any non-castable operating_company_id the conversion +
-- operating_company FK are skipped and a backfill is required; (b) the three FKs are NOT VALID — a
-- follow-up `VALIDATE CONSTRAINT` pass should be run after confirming no orphan legacy rows; (c)
-- vehicle_id intentionally has no FK (Samsara external id) — if a units linkage is ever wanted it must
-- key on integrations.samsara_vehicles, a separate decision.
-- =================================================================================================

BEGIN;

DO $$
DECLARE
  v_type text;
  v_bad  bigint;
BEGIN
  IF to_regclass('dispatch.border_crossing_events') IS NULL THEN
    RAISE NOTICE 'E2-3: dispatch.border_crossing_events absent — nothing to harden';
    RETURN;
  END IF;

  -- ── 0. Drop EVERY RLS policy that references operating_company_id BEFORE the ALTER COLUMN below ──
  -- Postgres refuses "ALTER COLUMN ... TYPE" while a policy references the column
  -- ("cannot alter type of a column used in a policy definition") — this was failing
  -- build-typecheck + security-audit. Both existing policies reference operating_company_id:
  --   * rls_dispatch_border_crossing_events_company   (migration 202606080111)
  --   * border_crossing_events_tenant_isolation       (migration 202606080112 RLS addendum)
  -- Both are recreated in step 2 below (after the type conversion) with a type-agnostic predicate.
  -- Idempotent (DROP ... IF EXISTS).
  DROP POLICY IF EXISTS rls_dispatch_border_crossing_events_company ON dispatch.border_crossing_events;
  DROP POLICY IF EXISTS border_crossing_events_tenant_isolation ON dispatch.border_crossing_events;

  -- ── 1. Guarded TEXT -> uuid conversion for operating_company_id ────────────────────────────────
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'dispatch'
    AND table_name   = 'border_crossing_events'
    AND column_name  = 'operating_company_id';

  IF v_type = 'text' THEN
    SELECT count(*) INTO v_bad
    FROM dispatch.border_crossing_events
    WHERE operating_company_id IS NOT NULL
      AND operating_company_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    IF v_bad = 0 THEN
      ALTER TABLE dispatch.border_crossing_events
        ALTER COLUMN operating_company_id TYPE uuid
        USING operating_company_id::uuid;
      RAISE NOTICE 'E2-3: operating_company_id converted TEXT -> uuid';
    ELSE
      RAISE NOTICE 'E2-3 BACKFLAG(Jorge): % non-castable operating_company_id row(s) — SKIPPING uuid conversion + operating_company FK; manual backfill required', v_bad;
    END IF;
  END IF;

  -- ── 2. Recreate RLS policies in a type-agnostic form ──────────────────────────────────────────
  DROP POLICY IF EXISTS rls_dispatch_border_crossing_events_company ON dispatch.border_crossing_events;
  CREATE POLICY rls_dispatch_border_crossing_events_company
    ON dispatch.border_crossing_events
    FOR ALL TO ih35_app
    USING (
      operating_company_id::text = current_setting('app.operating_company_id', true)
      OR current_setting('app.bypass_rls', true) = 'lucia'
    )
    WITH CHECK (
      operating_company_id::text = current_setting('app.operating_company_id', true)
      OR current_setting('app.bypass_rls', true) = 'lucia'
    );

  DROP POLICY IF EXISTS border_crossing_events_tenant_isolation ON dispatch.border_crossing_events;
  CREATE POLICY border_crossing_events_tenant_isolation
    ON dispatch.border_crossing_events
    USING (operating_company_id::uuid IN (SELECT org.user_accessible_company_ids()));

  -- ── 3. Missing FOREIGN KEYs (guarded + NOT VALID) ─────────────────────────────────────────────
  -- operating_company_id -> org.companies(id): only when the column is now uuid (FK type must match).
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'dispatch'
    AND table_name   = 'border_crossing_events'
    AND column_name  = 'operating_company_id';

  IF v_type = 'uuid'
     AND to_regclass('org.companies') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'fk_bce_operating_company'
         AND conrelid = 'dispatch.border_crossing_events'::regclass
     ) THEN
    ALTER TABLE dispatch.border_crossing_events
      ADD CONSTRAINT fk_bce_operating_company
      FOREIGN KEY (operating_company_id) REFERENCES org.companies(id)
      NOT VALID;
  END IF;

  -- driver_uuid -> mdata.drivers(id)
  IF to_regclass('mdata.drivers') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'fk_bce_driver'
         AND conrelid = 'dispatch.border_crossing_events'::regclass
     ) THEN
    ALTER TABLE dispatch.border_crossing_events
      ADD CONSTRAINT fk_bce_driver
      FOREIGN KEY (driver_uuid) REFERENCES mdata.drivers(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  -- load_uuid -> mdata.loads(id)
  IF to_regclass('mdata.loads') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'fk_bce_load'
         AND conrelid = 'dispatch.border_crossing_events'::regclass
     ) THEN
    ALTER TABLE dispatch.border_crossing_events
      ADD CONSTRAINT fk_bce_load
      FOREIGN KEY (load_uuid) REFERENCES mdata.loads(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END
$$;

-- ── 4. Re-assert tenant guardrails + grants (0065 pattern), idempotent ──────────────────────────
ALTER TABLE dispatch.border_crossing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch.border_crossing_events FORCE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA dispatch TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON dispatch.border_crossing_events TO ih35_app;

COMMIT;
