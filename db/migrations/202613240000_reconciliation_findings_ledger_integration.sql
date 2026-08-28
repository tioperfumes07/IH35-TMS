-- LAUNCH-SAFE-LEDGER-MONITOR-DETECTORS (CURSOR-VERIFY-MASTER-LAUNCH-PLAN-2026-08-28.md §1/§3:
-- "Monitor: 10 detectors on _system.reconciliation_findings, ledger.integrity_cron, Ledger
-- Health no human close" and STOP-CC1-ACCT-F5692-POD-GATE-2026-08-28.md §2: "stranded_intermediate
-- detector must cover unbilled_revenue (1150), undeposited_funds (1090), and cash_clearing, and
-- must not mix sample into the operating metric without labeling it.")
--
-- _system.reconciliation_findings already exists (QBO/Samsara reconciliation-worker.service.ts)
-- but its integration/finding_type CHECK constraints are closed sets that do not include a
-- 'ledger' integration or any ledger-integrity finding types. Additive widening only -- no
-- existing row, value, or consumer (qbo-recon-reads.ts, alert-routing.service.ts) is touched;
-- 'qbo'/'samsara'/'plaid'/'fmcsa' and the 7 existing finding_type values remain valid.
--
-- Read-side/monitoring schema change only. No GL/posting logic touched, no data changed.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reconciliation_findings_integration_check'
      AND conrelid = '_system.reconciliation_findings'::regclass
  ) THEN
    ALTER TABLE _system.reconciliation_findings DROP CONSTRAINT reconciliation_findings_integration_check;
  END IF;

  ALTER TABLE _system.reconciliation_findings
    ADD CONSTRAINT reconciliation_findings_integration_check
    CHECK (integration IN ('qbo', 'samsara', 'plaid', 'fmcsa', 'ledger'));

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
      'count_drift', 'value_drift', 'identity_mismatch', 'remote_unavailable',
      'webhook_projection_gap', 'schema_contract_gap', 'sync_metadata_stale',
      'stranded_intermediate_sample_commingled'
    ));
END
$$;

COMMIT;
