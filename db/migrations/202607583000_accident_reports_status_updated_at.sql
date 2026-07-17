-- 0441-mod6 — Accident edit 500 (missing updated_at) + status workflow columns
-- =============================================================================
-- CONTEXT: PATCH /api/v1/safety/accidents/:id SET updated_at = now() 42703'd because
-- safety.accident_reports (0049 + SC1/SAFE-1 ALTERs) had no updated_at column. PATCH
-- /api/v1/safety/accidents/:id/status SET status = $2, updated_at = now() had the same
-- landmine; the route wrapped the UPDATE in .catch(() => ({ rows: [] })) so the UI saw a
-- silent 404 instead of the real 500.
--
-- NON-FINANCIAL: additive schema on safety.accident_reports only. No GL/money/posting.
-- void-not-delete respected. Default status = open for existing + new rows.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS + guarded CHECK. Table grants from 0065 cover new cols.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('safety.accident_reports') IS NOT NULL THEN
    ALTER TABLE safety.accident_reports
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'chk_accident_reports_status'
        AND conrelid = 'safety.accident_reports'::regclass
    ) THEN
      ALTER TABLE safety.accident_reports
        ADD CONSTRAINT chk_accident_reports_status
        CHECK (
          status IN (
            'open',
            'under-investigation',
            'closed-no-fault',
            'closed-driver-at-fault'
          )
        );
    END IF;
  END IF;
END
$$;

COMMIT;
