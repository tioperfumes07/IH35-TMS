-- [FINANCIAL-ADJACENT] SAF-INTEGRITY-SUBJ — admit 'accounting' as an integrity-alert subject_type.
-- POSTS NOTHING. Additive: the CHECK is a TRUE SUPERSET of the live one — no member removed.
--
-- ROOT CAUSE, AND A COMPLETION OF MY OWN EARLIER FIX. Migration 202611180000 widened
-- integrity_alerts_alert_category_check to admit 'accounting_integrity' because the accounting
-- watchdog rules could not record themselves. That fix was correct but INCOMPLETE: it unblocked the
-- category constraint and the very next constraint caught the same INSERT. Prod 2026-08-03
-- (current_user asserted in-statement):
--   safety.integrity_alert_rules GROUP BY subject_type -> accounting 8 · driver 6 · unit 3
--   integrity_alerts_subject_type_check admits ONLY: driver, unit, vendor, unit_driver_pair,
--                                                    vendor_driver_pair
--   _system.background_jobs: safety.integrity_alert_engine_cron last_ok 2026-07-15,
--     last_fail 2026-08-03, last_error = 'new row for relation "integrity_alerts" violates check
--     constraint "integrity_alerts_subject_type_check"'
-- The engine writes rule.subject_type straight through, so all EIGHT accounting rules still abort the
-- whole cron tick — the same failure, one constraint further along.
--
-- WHY THIS MATTERS: those eight rules ARE the accounting watchdog (orphan bills with no GL, unapplied
-- payments, stale posting batches, unbalanced journal entries). The one alert class that would catch a
-- broken ledger has never been able to record itself, and safety.integrity_alerts still holds 0 rows.
--
-- WHY WIDEN RATHER THAN RE-LABEL THE 8 RULES: 'accounting' is a genuinely new subject class — the
-- subject is the LEDGER, not a driver or a unit. Re-pointing them at 'unit' would make the alert claim
-- to be about something it is not: a falsified label on an audit surface, which is worse than a red
-- cron (Rule 07).
--
-- SUPERSET VERIFIED, NOT ASSUMED: the five members below were read from pg_constraint on prod in this
-- session and are reproduced verbatim; only 'accounting' is added. Re-stating a CHECK is exactly how
-- members get silently dropped, so the list is copied from the live definition, never from memory.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + ADD. Apply-twice safe. No DROP COLUMN, no DELETE, no data
-- mutation — so no REHEARSED line is required by verify-data-migrations-rehearsed; it was rehearsed on
-- a prod fork regardless (see the PR evidence block).

BEGIN;

DO $$
DECLARE
  v_bad bigint;
BEGIN
  IF to_regclass('safety.integrity_alerts') IS NULL THEN
    RAISE EXCEPTION 'safety.integrity_alerts missing — refusing to widen blind';
  END IF;

  -- No existing row may fall outside the NEW set, or the constraint would be unenforceable.
  SELECT count(*) INTO v_bad
  FROM safety.integrity_alerts
  WHERE subject_type IS NOT NULL
    AND subject_type <> ALL (ARRAY[
      'driver','unit','vendor','unit_driver_pair','vendor_driver_pair','accounting'
    ]);

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'Refusing to widen: % existing integrity_alerts row(s) carry a subject_type outside the new set. '
      'Reconcile those rows first.', v_bad;
  END IF;

  ALTER TABLE safety.integrity_alerts
    DROP CONSTRAINT IF EXISTS integrity_alerts_subject_type_check;

  ALTER TABLE safety.integrity_alerts
    ADD CONSTRAINT integrity_alerts_subject_type_check
    CHECK (subject_type = ANY (ARRAY[
      'driver'::text,
      'unit'::text,
      'vendor'::text,
      'unit_driver_pair'::text,
      'vendor_driver_pair'::text,
      -- SAF-INTEGRITY-SUBJ: the accounting watchdog's subject is the LEDGER itself (orphan_bill_no_gl,
      -- orphan_payment_unapplied, stale_posting_batch, unbalanced_journal_entry).
      'accounting'::text
    ]));

  -- Fail closed: prove every configured rule can now actually insert.
  SELECT count(*) INTO v_bad
  FROM safety.integrity_alert_rules r
  WHERE r.subject_type IS NOT NULL
    AND r.subject_type <> ALL (ARRAY[
      'driver','unit','vendor','unit_driver_pair','vendor_driver_pair','accounting'
    ]);
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'SAF-INTEGRITY-SUBJ: % configured rule(s) still carry a subject_type the CHECK rejects', v_bad;
  END IF;
END $$;

COMMIT;
