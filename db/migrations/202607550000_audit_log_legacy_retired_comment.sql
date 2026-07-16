-- [HOLD-FOR-JORGE — TIER 0 cosmetic] Mark legacy public.audit_log / public.audit_log_partitioned as retired.
--
-- *** DO NOT apply on prod without Jorge's explicit approval. Build-and-HOLD; owner applies on Neon branch and
-- ledger-backfills so prod db:migrate skips it. ***
--
-- WHY: The real audit table is audit.row_changes (71K rows, already forced-RLS + tenant-scoped). The public.audit_log
-- table and its public.audit_log_partitioned successor are empty legacy/decoy tables that confuse engineers and
-- tooling. A COMMENT is sufficient to stop future confusion; we intentionally do NOT rename or drop them because a
-- latent reference could still exist.
--
-- Idempotent: COMMENT ON TABLE is a no-op when already set. Guarded by to_regclass so it runs cleanly whether the
-- tables exist or not. No schema change.

BEGIN;

DO $retire$
BEGIN
  IF to_regclass('public.audit_log') IS NOT NULL THEN
    EXECUTE $comment$COMMENT ON TABLE public.audit_log IS 'RETIRED legacy — real audit is audit.row_changes'$comment$;
  END IF;

  IF to_regclass('public.audit_log_partitioned') IS NOT NULL THEN
    EXECUTE $comment$COMMENT ON TABLE public.audit_log_partitioned IS 'RETIRED legacy — real audit is audit.row_changes'$comment$;
  END IF;
END
$retire$;

COMMIT;

-- ROLLBACK (owner-run only): reset comments to empty string.
-- COMMENT ON TABLE public.audit_log IS '';
-- COMMENT ON TABLE public.audit_log_partitioned IS '';
