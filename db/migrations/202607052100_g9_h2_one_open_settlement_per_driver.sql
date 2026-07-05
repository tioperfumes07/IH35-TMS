-- G9-H2 — At most ONE open settlement per driver (per operating company).
--
-- FINDING G9-H2: duplicate OPEN settlements can exist for the same driver because
-- there is no database-level uniqueness guard. The load-bookended engine
-- (settlements-load-bookended.service.ts) creates an accumulating settlement with
-- status = 'open' and only dedupes with an application-level SELECT ... FOR UPDATE
-- on (driver_id, operating_company_id, trip_closed_at IS NULL). Under concurrency
-- (two simultaneous load-close events for the same driver) that app-level check can
-- be raced, producing two 'open' settlements → double-pay risk.
--
-- FIX: a PARTIAL UNIQUE INDEX enforcing at most one row with status = 'open' per
-- (operating_company_id, driver_id). 'open' is the accumulation/live state (the
-- state the finding calls "OPEN"); once a settlement is closed/paid it leaves that
-- state (status becomes 'closed' / 'paid' / 'cancelled' / 'final' / 'approved' /
-- 'locked' etc.), so those rows are outside the index and never collide. The scope
-- key is (operating_company_id, driver_id) — matching the engine's own dedup query
-- and keeping the guard from producing false cross-entity collisions (a driver may
-- appear under more than one operating company, e.g. TRANSP vs USMCA).
--
-- Table is driver_finance.driver_settlements. Its status CHECK (migration 0143)
-- allows: draft, presettle, acked, locked, paid, held, cancelled, final, ready,
-- approved, open, closed. There is NO voided_at / soft-delete column on this table;
-- 'cancelled' is the void-equivalent terminal state. Hence "non-voided, non-closed"
-- is expressed as status = 'open'.
--
-- Idempotent: CREATE UNIQUE INDEX IF NOT EXISTS. No column added; append-only; no
-- data mutation. Additive-only.
--
-- ⚠️ PRE-EXISTING DUPLICATE CHECK REQUIRED BEFORE MERGE: if any
-- (operating_company_id, driver_id) already has ≥2 rows with status = 'open', this
-- index build will FAIL. Confirm none exist (or clean up first) before applying to
-- an environment that carries data. CI validates on a FRESH DB (no rows), so CI
-- will pass regardless — the duplicate check is a prod/data concern, owner-gated. No
-- data-mutating cleanup is written here on purpose.

BEGIN;

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_settlements') IS NULL THEN
    RAISE NOTICE 'Skipping G9-H2 unique index: driver_finance.driver_settlements missing';
    RETURN;
  END IF;

  EXECUTE $idx$
    CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_settlements_one_open_per_driver
      ON driver_finance.driver_settlements (operating_company_id, driver_id)
      WHERE status = 'open'
  $idx$;
END $$;

COMMIT;
