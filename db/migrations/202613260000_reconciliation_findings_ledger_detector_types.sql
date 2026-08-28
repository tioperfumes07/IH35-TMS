-- GO-0013 — ledger.integrity_cron is dark: every run since 2026-08-28T14:20:12Z dies with
-- "new row for relation \"reconciliation_findings\" violates check constraint
-- \"reconciliation_findings_finding_type_check\"". apps/backend/src/reconciliation/
-- ledger-integrity-detectors.service.ts writes 7 finding_type literals the live CHECK does not
-- admit — detector 2's INSERT aborts the whole transaction, so detectors 3+ never even get a
-- chance to run:
--   subledger_tie_out_diff, ask_my_accountant_suspense_nonzero, unbalanced_journal_entry,
--   document_no_gl_delta, future_dated_journal_entry (detectors 2-6, the ones GO-0013's own live
--   error surfaced)
--   journal_entry_voided_in_place, journal_entry_reversal_pointer_broken (detector 7 of the
--   file's own documented "plan's 10" — checkReversalIntegrityForCompany, live-wired, not dead
--   code. Fixing only the first 5 would let the cron limp one step further and crash again on
--   detector 7 with the identical symptom — found by running the new dual-artifact guard this
--   migration ships with against the real detector file before adding these two.)
-- All 7 verified as real, currently-reachable write sites via
-- scripts/verify-ledger-finding-type-dual-artifact.mjs (this PR) — not guessed from the incident
-- report alone. Read-side/monitoring schema change only; no GL/posting logic touched, no ledger
-- row rewritten.
--
-- Keep the 8 LIVE values verbatim from pg_get_constraintdef() on prod (do not retype from the
-- TypeScript FindingType unions, which are two separate, narrower per-integration types that
-- happen to overlap this constraint's admitted set) — additive widening only.
--
-- Idempotent DROP+ADD CHECK, same shape as the prior additive widening in
-- 202613240000_reconciliation_findings_ledger_integration.sql.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reconciliation_findings_finding_type_check'
      AND conrelid = '_system.reconciliation_findings'::regclass
  ) THEN
    ALTER TABLE _system.reconciliation_findings DROP CONSTRAINT reconciliation_findings_finding_type_check;
  END IF;

  ALTER TABLE _system.reconciliation_findings
    ADD CONSTRAINT reconciliation_findings_finding_type_check
    CHECK (finding_type IN (
      -- The 8 live values, verbatim from pg_get_constraintdef() on prod 2026-08-28.
      'count_drift',
      'value_drift',
      'identity_mismatch',
      'remote_unavailable',
      'webhook_projection_gap',
      'schema_contract_gap',
      'sync_metadata_stale',
      'stranded_intermediate_sample_commingled',
      -- The 7 new ledger-integrity-detectors.service.ts literals (GO-0013).
      'subledger_tie_out_diff',
      'ask_my_accountant_suspense_nonzero',
      'unbalanced_journal_entry',
      'document_no_gl_delta',
      'future_dated_journal_entry',
      'journal_entry_voided_in_place',
      'journal_entry_reversal_pointer_broken'
    ));
END $$;

COMMIT;
