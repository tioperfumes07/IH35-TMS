-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER] FACT-01 — FACTORING_GL_POSTING_ENABLED TRANSP-only.
-- *** DO NOT RUN ON PROD via db:migrate. Owner/agent Neon-applies then ledger-backfills. POSTS NOTHING. ***
-- Root cause: enabled overrides for TRK+USMCA (and effectively all three) violate the flag contract
-- ("Per-entity override (TRANSP only). Default OFF until CPA sign-off + Neon verification.").
-- Fix: disable non-TRANSP overrides (enabled=false). TRANSP left for owner CPA confirmation (REMAINING).
-- Cursor band. Idempotent. No GL writes.

BEGIN;

DO $$
DECLARE
  n int;
BEGIN
  IF to_regclass('lib.feature_flag_overrides') IS NULL OR to_regclass('org.companies') IS NULL THEN
    RAISE NOTICE 'FACT-01: flag overrides or companies absent — skip';
    RETURN;
  END IF;

  UPDATE lib.feature_flag_overrides o
     SET enabled = false,
         expires_at = COALESCE(o.expires_at, now())
    FROM org.companies c
   WHERE o.operating_company_id = c.id
     AND o.flag_key = 'FACTORING_GL_POSTING_ENABLED'
     AND c.code IN ('TRK', 'USMCA')
     AND o.enabled IS TRUE;

  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'FACT-01: disabled % non-TRANSP FACTORING_GL_POSTING_ENABLED override(s)', n;

  IF to_regclass('lib.feature_flags') IS NOT NULL THEN
    UPDATE lib.feature_flags
       SET description = 'Factoring secured-borrowing GL posting (Dr AR-assigned / Cr factoring advance liability). '
                      || 'Per-entity override TRANSP ONLY. Default OFF (kill switch) until CPA sign-off + Neon verification. '
                      || 'TRK/USMCA overrides must stay disabled — USMCA isolated; TRK not Faro borrower.'
     WHERE flag_key = 'FACTORING_GL_POSTING_ENABLED';
  END IF;
END
$$;

COMMIT;
