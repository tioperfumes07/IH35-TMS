-- [HOLD-FOR-JORGE — TIER 1] P2 DB-audit — safety.civil_fines void-not-delete gap.
--
-- *** DO NOT MERGE-AND-RUN. DO NOT RUN ON PROD. Run ONLY on a Neon branch by Jorge's hand, then
--     ledger-backfill so prod db:migrate skips it. Schema change (constraint swap + grant revoke on a
--     live table) — never self-merge per constitution §1.3/§1.4. ***
--
-- VERIFIED (read-only, db/migrations/ only — no prod DB access):
--   * safety.civil_fines is the canonical rename (migration 0050_two_section_v5_and_safety_restructure.sql
--     + repair 202606151200_repair_safety_0050_ordering_collision.sql) of the original
--     `safety.fines` table created by 0050_safety_gaps_fill.sql. Its CREATE TABLE (0050_safety_gaps_fill.sql)
--     has NO `voided_at` / `voided_reason` columns and a `status` CHECK that does NOT include 'voided'
--     (`CHECK (status IN ('open','paid','contested','dismissed','reduced'))`) — only a soft-archive
--     `deactivated_at`. A wrongly-entered civil (external/regulatory) fine can today ONLY be
--     UPDATE/DELETEd, never voided-with-a-trail. This violates the void-not-delete invariant (§2).
--   * Sibling table `safety.internal_fines` (same migration, lines ~260-275) already has the correct
--     shape: `status ... CHECK (... 'voided')`, `voided_at timestamptz`, `voided_reason text` — and NO
--     `voided_by_user_id` column (confirmed by reading its full column list — there isn't one). This
--     migration matches that exact shape (voided_at + voided_reason only) rather than inventing a new
--     field internal_fines doesn't have. See migration 0069_p3_t11_20_test_data_cleanup.sql lines 102-129
--     for the live void pattern this unlocks: `status='voided', voided_at=..., voided_reason=...`.
--   * ih35_app CAN currently DELETE safety.civil_fines rows: migration 0065_p3_cleanup_3_permanent_grants.sql
--     runs `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA safety TO ih35_app` — a blanket,
--     retroactive grant that includes civil_fines (0050's own explicit grant was only
--     SELECT/INSERT/UPDATE, but 0065 supersedes it schema-wide). This migration REVOKEs DELETE back off,
--     mirroring the existing precedent in 202606151300_expenses_header_phase1_foundation.sql
--     (`REVOKE DELETE ON accounting.expenses FROM ih35_app`) — locked by its own CI guard
--     (scripts/verify-expenses-cents-and-void-not-delete.mjs). This migration ships the equivalent guard
--     for civil_fines (scripts/verify-civil-fines-voidable.mjs).
--
-- WHAT THIS MIGRATION DOES (additive-only, idempotent, no data touched):
--   1. ADD COLUMN IF NOT EXISTS voided_at / voided_reason on safety.civil_fines.
--   2. Widen the status CHECK constraint to allow 'voided' (constraint is discovered dynamically via
--      pg_constraint — its auto-generated name is `fines_status_check` from when the table was still
--      named `safety.fines`; ALTER TABLE ... RENAME never renames constraints, so hard-coding a name
--      would be a guess. We instead find-and-drop-and-recreate by inspecting pg_get_constraintdef()).
--   3. REVOKE DELETE ON safety.civil_fines FROM ih35_app (void-not-delete, matches 0065's own default
--      schema-wide grant being the thing that created the gap in the first place).
--   4. A supporting partial index for the common "active (non-voided) fines" read path.
--
-- Fresh-DB safe: guarded by `to_regclass('safety.civil_fines') IS NOT NULL`. Never RAISEs.

BEGIN;

DO $$
DECLARE
  v_conname text;
BEGIN
  IF to_regclass('safety.civil_fines') IS NOT NULL THEN

    -- (1) void-not-delete columns — exact shape of safety.internal_fines (no voided_by_user_id there).
    ALTER TABLE safety.civil_fines
      ADD COLUMN IF NOT EXISTS voided_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS voided_reason text NULL;

    -- (2) widen the status CHECK to allow 'voided' — find the existing constraint by definition, not
    --     by a guessed name, since the table was renamed from `fines` after the constraint was created.
    SELECT con.conname INTO v_conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'safety'
      AND rel.relname = 'civil_fines'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%IN%'
      AND pg_get_constraintdef(con.oid) NOT ILIKE '%voided%'
    LIMIT 1;

    IF v_conname IS NOT NULL THEN
      EXECUTE format('ALTER TABLE safety.civil_fines DROP CONSTRAINT %I', v_conname);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'safety'
        AND rel.relname = 'civil_fines'
        AND con.conname = 'chk_civil_fines_status_voidable'
    ) THEN
      ALTER TABLE safety.civil_fines
        ADD CONSTRAINT chk_civil_fines_status_voidable
        CHECK (status IN ('open', 'paid', 'contested', 'dismissed', 'reduced', 'voided'));
    END IF;

    -- (3) void-not-delete: the app must never hard-DELETE a civil fine, only void it.
    REVOKE DELETE ON safety.civil_fines FROM ih35_app;

    -- (4) supporting index for the common "active (non-voided) fines" list/read path.
    CREATE INDEX IF NOT EXISTS ix_civil_fines_active
      ON safety.civil_fines (operating_company_id)
      WHERE voided_at IS NULL;

  END IF;
END
$$;

COMMIT;
