-- 202614440000_non_owned_trailers_unique_active.sql
--
-- CC-1, 2026-09-28. ROUND 155.2c: dispatch.non_owned_trailers had TWO identical rows for
-- trailer 538306 (same operating_company_id, same counterparty, same day) -- live-verified.
-- The existing unique constraint only covers active dispatch.trailer_interchanges rows;
-- nothing stopped a duplicate non_owned_trailers row from ever existing. The duplicate itself
-- (id ee930141-d366-4297-a1fb-4005536b47df) was voided, not deleted, in a separate live data
-- fix -- this migration only adds the missing constraint so it can never recur.
--
-- Idempotent, additive only.

DO $$
BEGIN
  IF to_regclass('dispatch.non_owned_trailers') IS NULL THEN
    RAISE NOTICE '202614440000: dispatch.non_owned_trailers absent -- skipped';
    RETURN;
  END IF;

  -- Refuse to apply if a live duplicate still exists (the round's own data fix must land first).
  IF EXISTS (
    SELECT 1 FROM dispatch.non_owned_trailers
     WHERE voided_at IS NULL
     GROUP BY operating_company_id, counterparty_id, trailer_number
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION '202614440000: a live (operating_company_id, counterparty_id, trailer_number) duplicate still exists among non-voided rows -- void it first, then re-run.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'dispatch' AND tablename = 'non_owned_trailers'
       AND indexname = 'uq_non_owned_trailers_active_counterparty_trailer'
  ) THEN
    CREATE UNIQUE INDEX uq_non_owned_trailers_active_counterparty_trailer
      ON dispatch.non_owned_trailers (operating_company_id, counterparty_id, trailer_number)
      WHERE voided_at IS NULL;
  END IF;
END $$;
