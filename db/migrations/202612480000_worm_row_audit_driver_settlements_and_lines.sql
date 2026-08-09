-- ACCT-F292 — attach the EXISTING row-audit trigger to every driver_finance MONEY-RECORD table
-- that lacks it. Reuses audit.tg_audit_row; creates no new audit machinery.
--
-- SCOPE CORRECTED AFTER MEASURING (this migration first covered only 2 tables):
-- prod br-fancy-credit-akjnd07a, bypass_rls in the same txn, pg_trigger/pg_proc — driver_finance has
-- 37 base tables, of which 14 ALREADY carry tg_audit_row (driver_bills, escrow_ledger,
-- escrow_balances, driver_settlement_deductions, driver_reimbursements, abandonment_chargebacks,
-- cash_advance_requests, driver_deduction_buckets, driver_deduction_bucket_events,
-- driver_escrow_separations, driver_settlement_disputes, settlement_disputes,
-- settlement_contract_lines, escrow_deductions_pending) and 23 DO NOT.
--
-- The unaudited 23 include the ones an auditor asks about first: driver_settlements, settlement_lines,
-- driver_advances, driver_liabilities, driver_pay_rates, deduction_schedule, team_settlement_splits,
-- settlement_payment_events, and all three GL-run tables. audit.row_changes holds 2,342,260 rows
-- across 34 distinct tables while the ENTIRE driver_finance schema accounts for 1 — so "who changed
-- what the driver was paid, and when" is currently unanswerable.
--
-- ONE SWEEP, NOT 19 MIGRATIONS (§9.0.17): the defect class is identical at every site, so it is fixed
-- once with a declared list rather than per-table.
--
-- 4 TABLES ARE DELIBERATELY EXCLUDED, and the reason is recorded so the omission is not read as an
-- oversight and is not "fixed" later by someone sweeping blindly:
--   cash_advance_owner_approval_audit, cash_advance_request_audit — these ARE audit sinks; auditing an
--     audit table is circular and doubles write volume on every approval.
--   trip_link_queue — a transient work queue, not a record of money. Its rows are consumed, not kept.
--   settlement_preview_costs — an ephemeral PREVIEW recomputed on demand; it is not the settlement.
--
-- DELETE stays in the event list even where trg_worm_refuse_delete already refuses deletes. They are
-- not redundant: the refusal is the CONTROL, the audit row is the EVIDENCE. If a refusal is ever
-- dropped, weakened, or bypassed by a superuser path, the audit trigger is what records it. A control
-- with no independent evidence is not an auditable control.
--
-- NO BACKFILL: rows predating the trigger legitimately have no audit row, and manufacturing history
-- for them would fabricate an audit trail — worse than the gap.
--
-- IDEMPOTENT + PREREQUISITE-GUARDED: keyed on pg_trigger so a re-run is a no-op, and it SKIPS with a
-- NOTICE (rather than failing) if audit.tg_audit_row() or a target table is absent, so a fresh CI
-- database built from an earlier point cannot break on it.

DO $$
DECLARE
  t text;
  targets text[] := ARRAY[
    'driver_settlements',
    'settlement_lines',
    'driver_advances',
    'driver_advance_accounts',
    'driver_liabilities',
    'deduction_schedule',
    'driver_pay_rates',
    'driver_pay_settings',
    'driver_payment_methods',
    'team_settlement_splits',
    'settlement_payment_events',
    'settlement_contract_terms_config',
    'driver_settlement_gl_runs',
    'driver_settlement_gl_bills',
    'payrun_gl_runs',
    'escrow_settings',
    'abandonment_defaults',
    'auto_deduction_policies',
    'signed_acknowledgments'
  ];
BEGIN
  IF to_regprocedure('audit.tg_audit_row()') IS NULL THEN
    RAISE NOTICE 'ACCT-F292: audit.tg_audit_row() not present; skipping trigger attach.';
    RETURN;
  END IF;

  FOREACH t IN ARRAY targets LOOP
    IF to_regclass('driver_finance.' || t) IS NULL THEN
      RAISE NOTICE 'ACCT-F292: driver_finance.% not present; skipping.', t;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'driver_finance'
        AND c.relname = t
        AND NOT tg.tgisinternal
        AND tg.tgname = 'tg_audit_row_' || t
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON driver_finance.%I '
        'FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row()',
        'tg_audit_row_' || t,
        t
      );
      RAISE NOTICE 'ACCT-F292: attached tg_audit_row_% to driver_finance.%', t, t;
    END IF;
  END LOOP;
END
$$;
