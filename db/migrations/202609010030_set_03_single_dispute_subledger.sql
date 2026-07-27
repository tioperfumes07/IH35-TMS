-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER] SET-03 — single dispute subledger.
-- *** DO NOT RUN ON PROD via db:migrate. Owner/agent Neon-applies then ledger-backfills. ***
-- Unify P6 stranded ledger onto canonical driver_finance.driver_settlement_disputes.
-- Additive columns only (Rule 07). Does NOT DROP driver_finance.settlement_disputes —
-- archive in place; writers forbidden by guard + GRANT revoke.
-- Both tables were 0 rows on prod (verified 2026-07-27 under app.bypass_rls='lucia').

BEGIN;

ALTER TABLE driver_finance.driver_settlement_disputes
  ADD COLUMN IF NOT EXISTS settlement_line_id uuid;
COMMENT ON COLUMN driver_finance.driver_settlement_disputes.settlement_line_id IS
  'SET-03 — optional settlement line the driver disputed (P6 wire). NULL when dispute is settlement-level.';

ALTER TABLE driver_finance.driver_settlement_disputes
  ADD COLUMN IF NOT EXISTS reason_code text;
COMMENT ON COLUMN driver_finance.driver_settlement_disputes.reason_code IS
  'SET-03 — free-text / P6 reason_code preserved verbatim. Canonical taxonomy stays in dispute_category.';

ALTER TABLE driver_finance.driver_settlement_disputes
  ADD COLUMN IF NOT EXISTS evidence_r2_paths text[];
COMMENT ON COLUMN driver_finance.driver_settlement_disputes.evidence_r2_paths IS
  'SET-03 — P6 evidence object paths (R2). Distinct from evidence_doc_ids (docs service uuids).';

DO $$
BEGIN
  IF to_regclass('driver_finance.settlement_disputes') IS NOT NULL THEN
    COMMENT ON TABLE driver_finance.settlement_disputes IS
      '@archived SET-03 (2026-07-27) — stranded parallel dispute ledger. Canonical = driver_finance.driver_settlement_disputes. Table kept (Rule 07 never-delete); writers revoked.';
    -- Fail-closed at the DB: strip PUBLIC + app writes; keep SELECT for forensics.
    REVOKE INSERT, UPDATE, DELETE ON driver_finance.settlement_disputes FROM PUBLIC;
    REVOKE INSERT, UPDATE, DELETE ON driver_finance.settlement_disputes FROM ih35_app;
    GRANT SELECT ON driver_finance.settlement_disputes TO ih35_app;
  END IF;
END $$;

COMMIT;
