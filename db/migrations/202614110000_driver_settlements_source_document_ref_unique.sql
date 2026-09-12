-- DO NOT RUN ON PROD — HELD (db/migrations/.held-migrations.json) until the live
-- S-2026-0011 / S-2026-5782 source_document_ref='5782' duplicate is reconciled by owner/Lead.
-- Runs on a Neon branch by hand once resolved, then ledger-backfilled. CI (fresh row-less DB) is
-- unaffected. If unheld, CREATE UNIQUE INDEX FAILs on the duplicate and blocks the deploy for all.
--
-- P1 SETTLEMENT NUMBERING (Claude Lead, ROUND 18.3, Item A) — at most ONE live settlement
-- per (operating_company_id, source_document_ref).
--
-- FINDING: driver_finance.driver_settlements.source_document_ref (the AlwaysTrack document
-- number a person actually reads) has NO uniqueness constraint. Two settlements can carry
-- the identical number — confirmed live on prod: S-2026-0011 and S-2026-5782 both carry
-- source_document_ref = '5782' (see OUTBOX-CC-3.md for full evidence: both are real, both
-- already posted, same driver, overlapping loads 13529/13540 — a genuine duplicate-payment
-- risk this index is designed to make structurally impossible going forward).
--
-- FIX: a PARTIAL UNIQUE INDEX on (operating_company_id, source_document_ref), scoped to
-- "live" rows only — WHERE source_document_ref IS NOT NULL AND voided_at IS NULL AND
-- reversed_at IS NULL AND status <> 'cancelled'. A voided/reversed/cancelled settlement is
-- the void-equivalent terminal state for this table (see G9-H2's own note: there is no
-- separate soft-delete column here beyond voided_at/reversed_at/status='cancelled') and must
-- NOT block the number from being (re-)carried by whichever settlement is the real, live one
-- — the allocator itself (settlement-document-number-allocator.ts) never reissues a number
-- that has ever been used regardless of status, so this narrower WHERE clause never permits
-- two live rows to actually collide in practice; it exists as the database-level backstop for
-- the same class of concurrency race G9-H2 guards against (two closes racing past an
-- application-level check).
--
-- Idempotent: CREATE UNIQUE INDEX IF NOT EXISTS. No column added; append-only; no data
-- mutation. Additive-only.
--
-- ⚠️ PRE-EXISTING DUPLICATE MUST BE RECONCILED BEFORE THIS APPLIES ON PROD: the live
-- S-2026-0011 / S-2026-5782 collision above will make this index build FAIL exactly like
-- G9-H2's own pre-merge duplicate-check warning. CI validates on a FRESH DB (no rows) and
-- will pass regardless. Applying to prod is BLOCKED pending the Claude Lead's decision on
-- which row keeps '5782' (STOP-and-ask posted, evidence does not decide it — see
-- OUTBOX-CC-3.md) — do not apply this migration until that reconciliation lands.
--
-- DO NOT RUN ON PROD until the live S-2026-0011 / S-2026-5782 source_document_ref='5782'
-- duplicate is reconciled by the owner/Lead. Registered in db/migrations/.held-migrations.json
-- so prod db:migrate (pre-deploy) SKIPS it — otherwise the index build FAILS on the duplicate
-- and blocks the deploy for every seat. Runs on a Neon branch by hand once '5782' is resolved,
-- then ledger-backfilled. CI validates on a fresh (row-less) DB and is unaffected.

BEGIN;

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_settlements') IS NULL THEN
    RAISE NOTICE 'Skipping Item-A unique index: driver_finance.driver_settlements missing';
    RETURN;
  END IF;

  EXECUTE $idx$
    CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_settlements_source_document_ref_live
      ON driver_finance.driver_settlements (operating_company_id, source_document_ref)
      WHERE source_document_ref IS NOT NULL
        AND voided_at IS NULL
        AND reversed_at IS NULL
        AND status <> 'cancelled'
  $idx$;
END $$;

COMMIT;
