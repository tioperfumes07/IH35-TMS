-- ─────────────────────────────────────────────────────────────────────────────
-- FEAT/ACCOUNTING-INTEGRITY-LEDGER-LOCK-PROBES
-- Closed-period write-guard for accounting.journal_entry_postings +
-- financial integrity probe rules for the alert engine.
--
-- WHAT EXISTS (do NOT recreate):
--   • accounting.periods + accounting.closed_period_cutoff() + accounting.raise_if_txn_in_closed_period()
--     → installed by 0183_p7_w2_accounting_periods_close.sql
--   • Closed-period triggers on journal_entries, bills, payments, bill_payments, invoices
--     → installed by 0183_p7_w2_accounting_periods_close.sql
--   • safety.integrity_alert_rules / _events / _alerts schema
--     → installed by 0347_safety_integrity_alerts.sql
--
-- WHAT THIS MIGRATION ADDS:
--   1. Closed-period BEFORE trigger on accounting.journal_entry_postings
--      (the one remaining ledger table without a guard — postings have no date
--       of their own; the trigger joins to the parent JE's entry_date)
--   2. Widens safety.integrity_alerts.alert_category CHECK enum  → adds 4 acct_ categories
--   3. Widens safety.integrity_alerts.subject_type CHECK enum    → adds journal_entry, bill, payment
--   4. Widens safety.integrity_alert_rules.subject_type CHECK    → same
--   5. Seeds 4 financial probe rules per company (idempotent ON CONFLICT DO NOTHING)
--
-- ERRCODE / message mirrors 0183 exactly: IH35_CLOSED_PERIOD / P0001
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS + IF NOT EXISTS guards
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  Closed-period write-guard on accounting.journal_entry_postings
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION accounting.trg_block_closed_period_je_postings()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_company_id uuid;
  v_entry_date  date;
BEGIN
  -- Postings carry no date — resolve through the parent journal entry.
  IF TG_OP = 'DELETE' THEN
    v_company_id := OLD.operating_company_id;
    SELECT je.entry_date INTO v_entry_date
      FROM accounting.journal_entries je
      WHERE je.id = OLD.journal_entry_uuid;
  ELSE
    v_company_id := NEW.operating_company_id;
    SELECT je.entry_date INTO v_entry_date
      FROM accounting.journal_entries je
      WHERE je.id = NEW.journal_entry_uuid;
  END IF;

  -- Reuse the canonical helper from 0183 — raises IH35_CLOSED_PERIOD / P0001.
  PERFORM accounting.raise_if_txn_in_closed_period(v_company_id, v_entry_date);

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

GRANT EXECUTE ON FUNCTION accounting.trg_block_closed_period_je_postings() TO ih35_app;

DROP TRIGGER IF EXISTS trg_block_closed_period_je_postings ON accounting.journal_entry_postings;
CREATE TRIGGER trg_block_closed_period_je_postings
  BEFORE INSERT OR UPDATE OR DELETE ON accounting.journal_entry_postings
  FOR EACH ROW
  EXECUTE FUNCTION accounting.trg_block_closed_period_je_postings();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  Widen safety.integrity_alerts.alert_category CHECK
--     Constraint auto-name from 0050_safety_gaps_fill.sql: integrity_alerts_alert_category_check
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE safety.integrity_alerts
  DROP CONSTRAINT IF EXISTS integrity_alerts_alert_category_check;

ALTER TABLE safety.integrity_alerts
  ADD CONSTRAINT integrity_alerts_alert_category_check
  CHECK (alert_category IN (
    -- Original safety/fleet categories (0050_safety_gaps_fill.sql)
    'tire_frequency_anomaly_unit',
    'repair_frequency_anomaly_unit',
    'unit_cost_anomaly',
    'accident_frequency_driver',
    'accident_frequency_unit',
    'driver_incident_frequency',
    'driver_repair_frequency',
    'driver_mpg_anomaly',
    'driver_tire_change_frequency',
    'vendor_cost_anomaly',
    'vendor_invoice_frequency',
    'vendor_driver_collusion_pattern',
    -- Financial integrity categories (added here)
    'acct_unbalanced_je',
    'acct_orphan_bill',
    'acct_orphan_payment',
    'acct_posting_closed_period',
    -- Legacy ledger_ prefix used by view-based probe rules seeded in earlier migrations
    'ledger_unbalanced_je',
    'ledger_orphan_bill',
    'ledger_orphan_payment',
    'ledger_posting_closed_period'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.  Widen safety.integrity_alerts.subject_type CHECK
--     Constraint auto-name: integrity_alerts_subject_type_check
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE safety.integrity_alerts
  DROP CONSTRAINT IF EXISTS integrity_alerts_subject_type_check;

ALTER TABLE safety.integrity_alerts
  ADD CONSTRAINT integrity_alerts_subject_type_check
  CHECK (subject_type IN (
    'driver', 'unit', 'vendor', 'unit_driver_pair', 'vendor_driver_pair',
    -- Financial integrity subject types (added here)
    'journal_entry', 'bill', 'payment', 'ledger'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.  Widen safety.integrity_alert_rules.subject_type CHECK
--     Constraint auto-name: integrity_alert_rules_subject_type_check
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE safety.integrity_alert_rules
  DROP CONSTRAINT IF EXISTS integrity_alert_rules_subject_type_check;

ALTER TABLE safety.integrity_alert_rules
  ADD CONSTRAINT integrity_alert_rules_subject_type_check
  CHECK (subject_type IN (
    'driver', 'unit', 'vendor', 'unit_driver_pair', 'vendor_driver_pair',
    -- Financial integrity subject types (added here)
    'journal_entry', 'bill', 'payment', 'ledger'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.  Seed 4 financial probe rules for every active company (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────

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
  c.id,
  seed.rule_code,
  seed.rule_name,
  seed.source_view,
  seed.alert_category,
  seed.subject_type,
  seed.threshold_config::jsonb,
  seed.severity,
  true
FROM org.companies c
CROSS JOIN (
  VALUES
    (
      'acct_unbalanced_je',
      'Unbalanced journal entry (inline SQL)',
      'accounting.v_unbalanced_jes_inline',
      'acct_unbalanced_je',
      'journal_entry',
      '{}'::text,
      'critical'
    ),
    (
      'acct_orphan_bill',
      'Orphan bill — no lines or missing GL account (inline SQL)',
      'accounting.v_orphan_bills_inline',
      'acct_orphan_bill',
      'bill',
      '{}'::text,
      'warning'
    ),
    (
      'acct_orphan_payment',
      'Orphan payment — unapplied, no application rows (inline SQL)',
      'accounting.v_orphan_payments_inline',
      'acct_orphan_payment',
      'payment',
      '{}'::text,
      'warning'
    ),
    (
      'acct_posting_closed_period',
      'Posting in closed period (inline SQL)',
      'accounting.v_postings_closed_period_inline',
      'acct_posting_closed_period',
      'journal_entry',
      '{}'::text,
      'critical'
    )
) AS seed(rule_code, rule_name, source_view, alert_category, subject_type, threshold_config, severity)
ON CONFLICT (operating_company_id, rule_code) DO NOTHING;

COMMIT;
