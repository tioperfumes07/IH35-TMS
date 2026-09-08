-- ACCT-RECONCILIATION-FINDINGS-CHECK-CONSTRAINT-MISSING-6-TYPES (board row, CC-2 2026-09-03, routed
-- to CC-1). apps/backend/src/reconciliation/ledger-integrity-detectors.service.ts writes 6
-- finding_type literals the live CHECK constraint does not admit:
--   test_named_account_in_coa            (checkTestNamedAccountForCompany)
--   journal_entry_fewer_than_two_postings (checkMinimumPostingLinesForCompany)
--   posting_orphan_or_cross_company_account (checkOrphanPostingsForCompany)
--   voided_document_reversal_broken      (checkVoidReversalIntegrityForCompany)
--   void_metadata_incomplete             (checkVoidMetadataCompletenessForCompany, 2 call sites)
--   is_sample_data_not_explicit          (checkSampleDataFlagExplicitForCompany)
-- Live-confirmed 2026-09-04 01:20:19 UTC: `_system.background_jobs.last_error_message` on
-- ledger.integrity_cron crashed with "new row for relation \"reconciliation_findings\" violates
-- check constraint \"reconciliation_findings_finding_type_check\"" the first time
-- checkTestNamedAccountForCompany found a real violation to report (USMCA carries 20 live
-- test-named rows across catalogs.accounts/mdata.drivers/customers/vendors/units). Each detector
-- call is already isolated in its own try/catch (BANK-F10002, same incident) so one detector
-- crashing no longer silences the other 14 for every company -- but these 6 finding_type values
-- still cannot ever persist until the CHECK is widened, which is this migration.
--
-- Re-verified live on prod 2026-09-08 (tiny-field-89581227, br-fancy-credit-akjnd07a) via
-- pg_get_constraintdef(): the constraint still admits exactly the 15 values the prior two
-- widenings (202613240000, 202613260000) left it at -- these 6 are still missing today, this is
-- not a stale/already-fixed finding.
--
-- Read-side/monitoring schema change only; no GL/posting logic touched, no ledger row rewritten.
-- Idempotent DROP+ADD CHECK, same shape as both prior additive widenings on this exact constraint.

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
      -- The 15 live values, verbatim from pg_get_constraintdef() on prod 2026-09-08.
      'count_drift',
      'value_drift',
      'identity_mismatch',
      'remote_unavailable',
      'webhook_projection_gap',
      'schema_contract_gap',
      'sync_metadata_stale',
      'stranded_intermediate_sample_commingled',
      'subledger_tie_out_diff',
      'ask_my_accountant_suspense_nonzero',
      'unbalanced_journal_entry',
      'document_no_gl_delta',
      'future_dated_journal_entry',
      'journal_entry_voided_in_place',
      'journal_entry_reversal_pointer_broken',
      -- The 6 new ledger-integrity-detectors.service.ts literals (this migration).
      'test_named_account_in_coa',
      'journal_entry_fewer_than_two_postings',
      'posting_orphan_or_cross_company_account',
      'voided_document_reversal_broken',
      'void_metadata_incomplete',
      'is_sample_data_not_explicit'
    ));
END $$;

COMMIT;
