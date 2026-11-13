-- ENG-60: Drop insurance.lawsuit (retired side-table, 0 rows all entities).
-- All reads moved to legal.matters type=lawsuit (migration 202616311200 retargeted FKs).
-- Authorized by ROUND 8.20: "dropping an empty table is authorized by this round."
-- NOTICE+RETURN on a fresh database — never RAISE EXCEPTION on prod data.

DO $$
DECLARE
  v_count bigint;
BEGIN
  -- Safety: skip entirely on a fresh database (no insurance schema yet)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'insurance' AND table_name = 'lawsuit'
  ) THEN
    RAISE NOTICE 'insurance.lawsuit does not exist — skipping (fresh database)';
    RETURN;
  END IF;

  SELECT count(*) INTO v_count FROM insurance.lawsuit;
  IF v_count > 0 THEN
    RAISE NOTICE 'insurance.lawsuit has % row(s) — skipping DROP (unexpected; verify prod before re-running)', v_count;
    RETURN;
  END IF;

  -- Drop insurance.claim.lawsuit_id FK and column (added by migration 202611130000)
  ALTER TABLE insurance.claim
    DROP CONSTRAINT IF EXISTS claim_lawsuit_id_fkey;
  ALTER TABLE insurance.claim
    DROP COLUMN IF EXISTS lawsuit_id;

  DROP TABLE IF EXISTS insurance.lawsuit;

  RAISE NOTICE 'ENG-60: insurance.lawsuit dropped (0 rows, claim.lawsuit_id column removed)';
END $$;
