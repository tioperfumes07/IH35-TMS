-- [FINANCIAL-ADJACENT] SAF-INTEGRITY-CAT — admit 'accounting_integrity' as an alert category so the
-- accounting-integrity watchdog can actually raise an alert.
-- Owner-approved 2026-08-02. Agent Neon-apply authorized (CPA ANSWERS H2, owner reaffirmed in chat).
-- POSTS NOTHING. Additive: the CHECK is a TRUE SUPERSET of the live one — no member removed.
--
-- ROOT CAUSE, PROVEN ON PROD (positive control mdata.vendors=2,828):
--   safety.integrity_alert_engine_cron failed again at 18:20 CT today with
--     new row for relation "integrity_alerts" violates check constraint
--     "integrity_alerts_alert_category_check"
--   The engine writes rule.alert_category straight from safety.integrity_alert_rules. EIGHT rule rows
--   carry alert_category = 'accounting_integrity', which the CHECK does not admit:
--     orphan_bill_no_gl (x2) · orphan_payment_unapplied (x2) · stale_posting_batch (x2) ·
--     unbalanced_journal_entry (x2)
--   So every time one of those rules matches, the INSERT is rejected and the whole cron tick dies.
--
-- WHY THIS MATTERS MORE THAN A RED CRON: those four rules are the ACCOUNTING watchdog — unbalanced
-- journal entries, bills with no GL, unapplied payments, stale posting batches. The one alert class
-- that would catch a broken ledger has never been able to record itself. safety.integrity_alerts holds
-- 0 rows, consistent with that.
--
-- WHY WIDEN RATHER THAN RE-CATEGORISE THE 8 ROWS: 'accounting_integrity' is a genuinely NEW category,
-- not a mislabel. Re-pointing those rules at an existing member (say 'unit_cost_anomaly') would make
-- the alert claim to be something it is not — a falsified label on an audit surface, which is worse
-- than a red cron. Additive widening keeps the alert's meaning true (Rule 07).
--
-- SUPERSET VERIFIED, NOT ASSUMED: the 12 members below were read from pg_constraint on prod in this
-- session and are reproduced verbatim; only 'accounting_integrity' is added. Re-stating a CHECK is how
-- members get silently dropped, so the list is copied from the live definition rather than from memory
-- or from an older migration.
--
-- SAFE: safety.integrity_alerts currently holds 0 rows, so no existing row can violate the new CHECK.
-- The migration still counts violators first and RAISEs rather than adding an unenforceable constraint.
-- Idempotent: DROP CONSTRAINT IF EXISTS + ADD. Apply-twice safe. No DROP COLUMN, no DELETE.

BEGIN;

DO $$
DECLARE
  v_bad bigint;
BEGIN
  IF to_regclass('safety.integrity_alerts') IS NULL THEN
    RAISE EXCEPTION 'safety.integrity_alerts missing — refusing to widen blind';
  END IF;

  SELECT count(*) INTO v_bad
  FROM safety.integrity_alerts
  WHERE alert_category IS NOT NULL
    AND alert_category <> ALL (ARRAY[
      'tire_frequency_anomaly_unit','repair_frequency_anomaly_unit','unit_cost_anomaly',
      'accident_frequency_driver','accident_frequency_unit','driver_incident_frequency',
      'driver_repair_frequency','driver_mpg_anomaly','driver_tire_change_frequency',
      'vendor_cost_anomaly','vendor_invoice_frequency','vendor_driver_collusion_pattern',
      'accounting_integrity'
    ]);

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'Refusing to widen: % existing integrity_alerts row(s) carry a category outside the new set. '
      'Reconcile those rows first.', v_bad;
  END IF;

  ALTER TABLE safety.integrity_alerts
    DROP CONSTRAINT IF EXISTS integrity_alerts_alert_category_check;

  ALTER TABLE safety.integrity_alerts
    ADD CONSTRAINT integrity_alerts_alert_category_check
    CHECK (alert_category = ANY (ARRAY[
      'tire_frequency_anomaly_unit'::text,
      'repair_frequency_anomaly_unit'::text,
      'unit_cost_anomaly'::text,
      'accident_frequency_driver'::text,
      'accident_frequency_unit'::text,
      'driver_incident_frequency'::text,
      'driver_repair_frequency'::text,
      'driver_mpg_anomaly'::text,
      'driver_tire_change_frequency'::text,
      'vendor_cost_anomaly'::text,
      'vendor_invoice_frequency'::text,
      'vendor_driver_collusion_pattern'::text,
      -- SAF-INTEGRITY-CAT: the accounting watchdog (orphan_bill_no_gl, orphan_payment_unapplied,
      -- stale_posting_batch, unbalanced_journal_entry).
      'accounting_integrity'::text
    ]));
END $$;

COMMIT;
