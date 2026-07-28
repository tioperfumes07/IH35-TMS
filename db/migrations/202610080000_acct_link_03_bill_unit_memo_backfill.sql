-- [HOLD-FOR-JORGE — FINANCIAL] ACCT-LINK-03 — backfill accounting.bills.unit_id from memo tokens.
--
-- *** DO NOT RUN ON PROD via db:migrate. Owner/agent Neon-applies then ledger-backfills. POSTS NOTHING. ***
--
-- ROOT CAUSE: createBill / WO→bill writers stamp unit_id, but ~16k QBO-projected bills landed with
--   vendor_id only. Live Neon 2026-07-28 (lucia): unit_id=0, insurance_claim_id=0,
--   linked_work_order_uuid=0. Settlement/repair memos already carry exact unit tokens (T146, …).
--
-- FIX: idempotent entity-scoped memo→unit stamp for UNIQUE word-boundary matches only.
--   Match when unit.owner_company_id OR currently_leased_to_company_id = bill.operating_company_id.
--   Skip ambiguous multi-unit memos. No GL math. No bill create/void. No claim/WO invention.
--
-- EXPECTED (dry-run 2026-07-28): ~299 unique stamps; ~5 ambiguous skipped.

BEGIN;

DO $$
DECLARE
  n_updated int := 0;
BEGIN
  -- FORCED-RLS tables: backfill must see all opcos (same pattern as live GUARD lucia proof).
  PERFORM set_config('app.bypass_rls', 'lucia', true);

  IF to_regclass('accounting.bills') IS NULL OR to_regclass('mdata.units') IS NULL THEN
    RAISE NOTICE 'ACCT-LINK-03 backfill: tables missing — skip';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'accounting'
      AND table_name = 'bills'
      AND column_name = 'unit_id'
  ) THEN
    RAISE NOTICE 'ACCT-LINK-03 backfill: bills.unit_id absent — skip';
    RETURN;
  END IF;

  WITH units AS (
    SELECT
      id,
      owner_company_id,
      currently_leased_to_company_id,
      regexp_replace(unit_number, '\s*\(.*\)$', '') AS unit_token
    FROM mdata.units
    WHERE deactivated_at IS NULL
      AND regexp_replace(unit_number, '\s*\(.*\)$', '') ~ '^T[0-9]{2,4}$'
  ),
  hits AS (
    SELECT
      b.id AS bill_id,
      u.id AS unit_id,
      COUNT(*) OVER (PARTITION BY b.id) AS match_count
    FROM accounting.bills b
    JOIN units u
      ON (
           u.owner_company_id = b.operating_company_id
        OR u.currently_leased_to_company_id = b.operating_company_id
      )
     AND b.memo ~* ('\m' || u.unit_token || '\M')
    WHERE b.voided_at IS NULL
      AND b.unit_id IS NULL
      AND b.memo IS NOT NULL
      AND btrim(b.memo) <> ''
  ),
  unique_hits AS (
    SELECT bill_id, unit_id
    FROM hits
    WHERE match_count = 1
  )
  UPDATE accounting.bills b
  SET unit_id = uh.unit_id,
      updated_at = now()
  FROM unique_hits uh
  WHERE b.id = uh.bill_id
    AND b.unit_id IS NULL;

  GET DIAGNOSTICS n_updated = ROW_COUNT;
  RAISE NOTICE 'ACCT-LINK-03 backfill: stamped unit_id on % bills', n_updated;
END
$$;

COMMIT;
