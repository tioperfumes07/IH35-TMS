-- AI-3: Seed accounting integrity probe rules for all active companies.
-- Extends subject_type CHECK to allow 'accounting' for non-driver/unit probes.
-- Idempotent via ON CONFLICT DO NOTHING on (operating_company_id, rule_code).

BEGIN;

-- Extend subject_type to include accounting probes
ALTER TABLE safety.integrity_alert_rules
  DROP CONSTRAINT IF EXISTS integrity_alert_rules_subject_type_check;

ALTER TABLE safety.integrity_alert_rules
  ADD CONSTRAINT integrity_alert_rules_subject_type_check
  CHECK (subject_type IN (
    'driver', 'unit', 'vendor', 'unit_driver_pair', 'vendor_driver_pair', 'accounting'
  ));

-- Insert 4 accounting integrity probe rules per active company
INSERT INTO safety.integrity_alert_rules (
  operating_company_id,
  rule_code,
  rule_name,
  source_view,
  alert_category,
  subject_type,
  threshold_config,
  severity,
  enabled
)
SELECT
  c.id AS operating_company_id,
  r.rule_code,
  r.rule_name,
  r.source_view,
  r.alert_category,
  'accounting' AS subject_type,
  r.threshold_config::jsonb,
  r.severity,
  true AS enabled
FROM org.companies c
CROSS JOIN (
  VALUES
    (
      'unbalanced_journal_entry',
      'Unbalanced Journal Entry',
      'accounting.v_unbalanced_journal_entries',
      'accounting_integrity',
      '{"lookback_days": 90}',
      'critical'
    ),
    (
      'orphan_bill_no_gl',
      'Orphan Bill — No GL Account',
      'accounting.v_orphan_bills_no_gl',
      'accounting_integrity',
      '{"lookback_days": 90}',
      'warning'
    ),
    (
      'orphan_payment_unapplied',
      'Orphan Payment — Unapplied Balance',
      'accounting.v_orphan_payments_unapplied',
      'accounting_integrity',
      '{"stale_days": 7}',
      'warning'
    ),
    (
      'stale_posting_batch',
      'Stale Posting Batch',
      'accounting.v_stale_posting_batches',
      'accounting_integrity',
      '{"stale_days": 7}',
      'warning'
    )
) AS r(rule_code, rule_name, source_view, alert_category, threshold_config, severity)
WHERE c.is_active = true
  AND c.deactivated_at IS NULL
ON CONFLICT (operating_company_id, rule_code) DO NOTHING;

COMMIT;
